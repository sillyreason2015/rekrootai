import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, MapPin, Clock, Wifi, Building2 } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Job } from '../../types'

const TYPES = ['All', 'full-time', 'part-time', 'contract', 'internship']
const REMOTE = ['All', 'on-site', 'hybrid', 'remote']

export default function JobBoard() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('All')
  const [remote, setRemote] = useState('All')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', search, type, remote, page],
    queryFn: () =>
      jobService.list({
        page,
        limit: 12,
        search: search || undefined,
        type: type === 'All' ? undefined : type,
        remote: remote === 'All' ? undefined : remote,
      }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Job Board</h1>
        <p className="text-sm text-muted-foreground">Discover roles matched to your skills.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title, skill, or company..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
        >
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={remote}
          onChange={(e) => { setRemote(e.target.value); setPage(1) }}
        >
          {REMOTE.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} roles found</p>
          {data?.data.length === 0 ? (
            <div className="rounded-xl border border-dashed py-20 text-center text-muted-foreground">
              <Search className="mx-auto mb-3 h-8 w-8 opacity-30" />
              <p className="font-medium">No roles match your search</p>
              <p className="mt-1 text-sm">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data?.data.map((job: Job) => <JobCard key={job._id} job={job} />)}
            </div>
          )}

          {/* Pagination */}
          {(data?.totalPages ?? 1) > 1 && (
            <div className="flex justify-center gap-2">
              <button
                className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span className="px-2 py-1 text-sm">{page} / {data?.totalPages}</span>
              <button
                className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                disabled={page === data?.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const company = typeof job.company === 'object' ? job.company : null

  return (
    <Card className="hover:border-primary/30 hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <Badge variant="secondary">{job.type}</Badge>
        </div>
        <h3 className="font-serif text-base font-semibold leading-snug">{job.title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{company?.name ?? 'Company'}</p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {job.location}
          </span>
          <span className="flex items-center gap-1">
            <Wifi className="h-3 w-3" /> {job.remote}
          </span>
          {job.salaryMin && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {job.salaryCurrency}{job.salaryMin.toLocaleString()}
              {job.salaryMax ? `–${job.salaryMax.toLocaleString()}` : '+'}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.skills.slice(0, 4).map((s) => (
            <span key={s} className="rounded-full bg-accent px-2 py-0.5 text-xs">{s}</span>
          ))}
          {job.skills.length > 4 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs">+{job.skills.length - 4}</span>
          )}
        </div>

        <div className="mt-4">
          <Link
            to={`/candidate/jobs/${job._id}`}
            className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View & Apply
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
