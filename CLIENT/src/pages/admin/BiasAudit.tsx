import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart3, AlertTriangle, CheckCircle2, Loader2, Play } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { jobService } from '../../services/job.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { formatDate } from '../../lib/utils'
import type { BiasAudit as BiasAuditType } from '../../types'

export default function BiasAudit() {
  const [selectedJob, setSelectedJob] = useState('')
  const qc = useQueryClient()

  const { data: audits, isLoading } = useQuery({
    queryKey: ['bias-audits'],
    queryFn: adminService.getBiasAudits,
  })

  const { data: jobs } = useQuery({
    queryKey: ['my-jobs-admin'],
    queryFn: () => jobService.myJobs({ limit: 50 } as Parameters<typeof jobService.myJobs>[0]),
  })

  const runMutation = useMutation({
    mutationFn: () => adminService.runBiasAudit(selectedJob),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bias-audits'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Bias Audit</h1>
          <p className="text-sm text-muted-foreground">Fairness analysis across protected attributes.</p>
        </div>
        <AiBadge label="Fairness Gate" size="md" />
      </div>

      {/* Run audit */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Run New Bias Audit</p>
            <p className="text-sm text-muted-foreground">Analyses disparate impact across gender, ethnicity, and age.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
            >
              <option value="">Select job...</option>
              {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
            </select>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={!selectedJob || runMutation.isPending}
            >
              {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Audit
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <LoadingSpinner /> : !audits?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No audits run yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {audits.map((audit: BiasAuditType) => (
            <Card key={audit._id} className={audit.flagged ? 'border-destructive/30' : 'border-emerald-200'}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  {audit.flagged ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  )}
                  <CardTitle className="text-base">
                    Job: {typeof audit.job === 'object' ? audit.job.title : audit.job}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={audit.flagged ? 'destructive' : 'success'}>
                    {audit.flagged ? 'Flagged' : 'Passed'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(audit.runAt)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <h4 className="mb-3 text-sm font-medium">Disparate Impact Ratios</h4>
                <div className="space-y-3">
                  {Object.entries(audit.disparateImpact).map(([attr, ratio]) => (
                    <div key={attr} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted-foreground">{attr.replace(/_/g, ' ')}</span>
                        <span className={`font-semibold ${ratio < 0.8 ? 'text-destructive' : 'text-emerald-600'}`}>
                          {ratio.toFixed(3)}
                          {ratio < 0.8 && <span className="ml-1 text-xs">(⚠ Below 4/5 rule)</span>}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${ratio < 0.8 ? 'bg-destructive' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {audit.flagged && (
                  <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    One or more attributes fall below the 4/5ths (80%) rule. Review the selection pipeline before proceeding.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
