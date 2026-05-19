import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobService } from '../../services/job.service'
import { Plus, Trash2, Search, Upload, Sparkles, FileText, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import api from '../../lib/axios'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Question } from '../../types'

interface BankQuestion extends Question {
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
}

const fetchBank = () => api.get<BankQuestion[]>('/question-bank').then((r) => r.data)
const deleteQuestion = (id: string) => api.delete(`/question-bank/${id}`)

const diffBg: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-red-50 text-red-700 border-red-200',
}

export default function QuestionBank() {
  const qc = useQueryClient()
  const { data: questions, isLoading } = useQuery({ queryKey: ['question-bank'], queryFn: fetchBank })
  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [diffFilter, setDiffFilter] = useState('All')

  // Manual add
  const [showAdd, setShowAdd] = useState(false)
  const [newQ, setNewQ] = useState<Partial<BankQuestion>>({ type: 'mcq', options: ['', '', '', ''], points: 1, difficulty: 'medium', tags: [] })

  // AI generate
  const [genType, setGenType] = useState('aptitude')
  const [genDiff, setGenDiff] = useState('medium')
  const [genCount, setGenCount] = useState(5)
  const [genCategory, setGenCategory] = useState('')
  const [genJobId, setGenJobId] = useState('')
  const [genResult, setGenResult] = useState<{ added: number; source?: string; geminiError?: string } | null>(null)
  const [genError, setGenError] = useState('')

  // Upload
  const [uploadDiff, setUploadDiff] = useState('medium')
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadResult, setUploadResult] = useState<{ added: number } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = (questions ?? []).filter((q) => {
    const matchSearch = q.text.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'All' || q.category === categoryFilter
    const matchDiff = diffFilter === 'All' || q.difficulty === diffFilter
    return matchSearch && matchCat && matchDiff
  })

  const categories = ['All', ...Array.from(new Set(questions?.map((q) => q.category) ?? []))]

  const addMutation = useMutation({
    mutationFn: (q: Partial<BankQuestion>) => api.post('/question-bank', q).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['question-bank'] })
      setShowAdd(false)
      setNewQ({ type: 'mcq', options: ['', '', '', ''], points: 1, difficulty: 'medium', tags: [] })
    },
  })

  const delMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question-bank'] }),
  })

  const generateMutation = useMutation({
    mutationFn: () => api.post('/question-bank/generate', { moduleType: genType, difficulty: genDiff, count: genCount, category: genCategory || undefined, jobId: genJobId || undefined }).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['question-bank'] })
      setGenResult(data)
      setGenError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setGenError(msg ?? 'Generation failed. Please try again.')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      form.append('difficulty', uploadDiff)
      if (uploadCategory) form.append('category', uploadCategory)
      return api.post('/question-bank/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['question-bank'] })
      setUploadResult(data)
      setUploadError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setUploadError(msg ?? 'Upload failed. Please try again.')
    },
  })

  const handleFileDrop = (file: File) => {
    setUploadResult(null)
    setUploadError('')
    uploadMutation.mutate(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Question Bank</h1>
          <p className="text-sm text-muted-foreground">{questions?.length ?? 0} questions · used in AI-proctored assessments</p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)} variant={showAdd ? 'outline' : 'default'}>
          {showAdd ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Close' : 'Add Question'}
        </Button>
      </div>

      {/* Add / Generate / Upload Tabs */}
      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate" className="gap-1.5"><Sparkles className="h-4 w-4" /> AI Generate</TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5"><Upload className="h-4 w-4" /> Upload Document</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><Plus className="h-4 w-4" /> Manual</TabsTrigger>
        </TabsList>

        {/* AI Generate */}
        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Generate Questions with AI
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Select a job for role-specific questions generated by Gemini AI, or leave blank for general templates.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Job (optional — enables AI generation)</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={genJobId} onChange={(e) => setGenJobId(e.target.value)}>
                  <option value="">No job selected — use general templates</option>
                  {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
                </select>
                {genJobId && (
                  <p className="text-xs text-primary">✦ Gemini AI will generate questions tailored to this role's skills and requirements.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Module Type</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={genType} onChange={(e) => setGenType(e.target.value)}>
                    {['aptitude', 'technical', 'situational', 'personality', 'values'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={genDiff} onChange={(e) => setGenDiff(e.target.value)}>
                    {['easy', 'medium', 'hard'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Count</Label>
                  <Input type="number" min={1} max={50} value={genCount} onChange={(e) => setGenCount(+e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category (optional)</Label>
                  <Input placeholder="e.g. React, Finance" value={genCategory} onChange={(e) => setGenCategory(e.target.value)} />
                </div>
              </div>
              {genError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{genError}</p>}
              {genResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {genResult.added} questions added
                    {genResult.source === 'gemini'
                      ? ' · generated by Gemini AI for this role'
                      : genResult.source === 'gemini-cached'
                      ? ' · served from cache (Gemini AI, generated earlier today)'
                      : genResult.source === 'templates-rate-limited'
                      ? ' · used general templates (Gemini rate-limited — try again in a minute)'
                      : ' · from general templates'}.
                  </div>
                  {genResult.geminiError && (genResult.source === 'templates-gemini-error' || genResult.source === 'templates' || genResult.source === 'templates-rate-limited') && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Gemini AI unavailable:</span> {genResult.geminiError}. General templates were used instead.
                    </div>
                  )}
                </div>
              )}
              <Button onClick={() => { setGenResult(null); generateMutation.mutate() }} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Questions
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upload Document */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Upload Question Document
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a PDF, DOCX, or TXT file containing questions. The system detects numbered items and MCQ options automatically.
                <br />
                <span className="font-medium text-foreground">Format tip:</span> Number questions as "1." or "Q1." and label options as "A." / "B." for best extraction.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={uploadDiff} onChange={(e) => setUploadDiff(e.target.value)}>
                    {['easy', 'medium', 'hard'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category (optional)</Label>
                  <Input placeholder="e.g. JavaScript, Finance" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} />
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={`relative flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleFileDrop(file)
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileDrop(f) }}
                />
                {uploadMutation.isPending ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Parsing document…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Drop your file here or click to browse</p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT · max 10 MB</p>
                  </div>
                )}
              </div>

              {uploadError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{uploadError}</p>}
              {uploadResult && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                  <FileText className="h-4 w-4" /> {uploadResult.added} questions extracted and added to your bank.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual */}
        <TabsContent value="manual">
          <Card>
            <CardHeader><CardTitle>Add Question Manually</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Question Text</Label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-background p-3 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                  value={newQ.text ?? ''}
                  onChange={(e) => setNewQ((p) => ({ ...p, text: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={newQ.type}
                    onChange={(e) => setNewQ((p) => ({ ...p, type: e.target.value as Question['type'] }))}>
                    {['mcq', 'open', 'code'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input value={newQ.category ?? ''} onChange={(e) => setNewQ((p) => ({ ...p, category: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={newQ.difficulty}
                    onChange={(e) => setNewQ((p) => ({ ...p, difficulty: e.target.value as BankQuestion['difficulty'] }))}>
                    {['easy', 'medium', 'hard'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              {newQ.type === 'mcq' && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {newQ.options?.map((opt, i) => (
                    <Input key={i} placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => {
                        const opts = [...(newQ.options ?? [])]
                        opts[i] = e.target.value
                        setNewQ((p) => ({ ...p, options: opts }))
                      }} />
                  ))}
                  <div className="space-y-1.5">
                    <Label>Correct Answer Index (0-based)</Label>
                    <Input type="number" min={0} max={3}
                      value={newQ.correctIndex ?? 0}
                      onChange={(e) => setNewQ((p) => ({ ...p, correctIndex: +e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button onClick={() => addMutation.mutate(newQ)} disabled={addMutation.isPending || !newQ.text}>
                  {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Question
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)}>
          {['All', 'easy', 'medium', 'hard'].map((d) => <option key={d}>{d}</option>)}
        </select>
        <span className="flex h-9 items-center text-sm text-muted-foreground">{filtered.length} results</span>
      </div>

      {/* Questions list */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <QuestionCard key={q._id} q={q} onDelete={() => delMutation.mutate(q._id)} deleting={delMutation.isPending} />
          ))}
          {!filtered.length && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No questions found. Generate or upload some above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function QuestionCard({ q, onDelete, deleting }: { q: BankQuestion; onDelete: () => void; deleting: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="hover:border-primary/20 transition-colors">
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium leading-relaxed flex-1">{q.text}</p>
            {q.options?.length ? (
              <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-muted-foreground hover:text-foreground">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
          {expanded && q.options?.filter(Boolean).length ? (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {q.options.filter(Boolean).map((opt, i) => (
                <div key={i} className={`rounded-md border px-3 py-1.5 text-xs ${i === q.correctIndex ? 'border-emerald-300 bg-emerald-50 text-emerald-700 font-medium' : 'bg-muted/30'}`}>
                  {String.fromCharCode(65 + i)}. {opt}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">{q.type}</Badge>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${diffBg[q.difficulty]}`}>{q.difficulty}</span>
            {q.category && <Badge variant="secondary" className="text-xs">{q.category}</Badge>}
            {q.tags?.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  )
}
