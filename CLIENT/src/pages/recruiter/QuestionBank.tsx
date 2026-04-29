import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Search, Filter } from 'lucide-react'
import api from '../../lib/axios'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Question } from '../../types'

interface BankQuestion extends Question {
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
}

const fetchBank = () => api.get<BankQuestion[]>('/question-bank').then((r) => r.data)
const createQuestion = (q: Partial<BankQuestion>) => api.post('/question-bank', q).then((r) => r.data)
const deleteQuestion = (id: string) => api.delete(`/question-bank/${id}`)

export default function QuestionBank() {
  const qc = useQueryClient()
  const { data: questions, isLoading } = useQuery({ queryKey: ['question-bank'], queryFn: fetchBank })
  const [filtered, setFiltered] = useState<BankQuestion[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [newQ, setNewQ] = useState<Partial<BankQuestion>>({ type: 'mcq', options: ['', '', '', ''], points: 1, difficulty: 'medium', tags: [] })

  useEffect(() => {
    if (!questions) return
    setFiltered(
      questions.filter((q) => {
        const matchSearch = q.text.toLowerCase().includes(search.toLowerCase())
        const matchCat = category === 'All' || q.category === category
        return matchSearch && matchCat
      }),
    )
  }, [questions, search, category])

  const addMutation = useMutation({
    mutationFn: createQuestion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['question-bank'] }); setShowForm(false) },
  })

  const delMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['question-bank'] }),
  })

  const categories = ['All', ...Array.from(new Set(questions?.map((q) => q.category) ?? []))]
  const diffColor: Record<string, string> = { easy: 'success', medium: 'warning', hard: 'destructive' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Question Bank</h1>
          <p className="text-sm text-muted-foreground">{questions?.length ?? 0} questions stored</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> Add Question
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Question</CardTitle></CardHeader>
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
                  <div key={i} className="flex gap-2">
                    <Input placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => {
                        const opts = [...(newQ.options ?? [])]
                        opts[i] = e.target.value
                        setNewQ((p) => ({ ...p, options: opts }))
                      }} />
                  </div>
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
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={() => addMutation.mutate(newQ)} disabled={addMutation.isPending || !newQ.text}>
                Save Question
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <Card key={q._id} className="hover:border-primary/20 transition-colors">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{q.type}</Badge>
                    <Badge variant={diffColor[q.difficulty] as 'success' | 'warning' | 'destructive'}>{q.difficulty}</Badge>
                    {q.category && <Badge variant="secondary">{q.category}</Badge>}
                    {q.tags?.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                </div>
                <button
                  onClick={() => delMutation.mutate(q._id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
          {!filtered.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">No questions found.</p>
          )}
        </div>
      )}
    </div>
  )
}
