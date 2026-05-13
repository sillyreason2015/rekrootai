import { ApplicationModel } from '../models/Application.model.js'
import { ProtectedAttributeModel } from '../models/ProtectedAttribute.model.js'

type AttributeKey = 'gender' | 'ageRange' | 'ethnicity'

export interface JobBiasAuditComputation {
  disparateImpact: Record<string, number>
  flagged: boolean
  details: {
    summary: string
    totalApplications: number
    progressedApplications: number
    selectionRate: number
    threshold: number
    groups: Record<string, Array<{ value: string; total: number; progressed: number; selectionRate: number }>>
  }
}

function progressedStage(stage: string) {
  return ['screening', 'assessment', 'interview', 'decision', 'offered'].includes(stage)
}

function computeAttributeParity(
  rows: Array<{ candidate: string; stage: string }>,
  attrs: Record<string, { gender?: string; ageRange?: string; ethnicity?: string }>,
  key: AttributeKey,
) {
  const groupMap = new Map<string, { total: number; progressed: number }>()
  for (const row of rows) {
    const value = attrs[row.candidate]?.[key]
    if (!value || value === 'Prefer not to say') continue
    const current = groupMap.get(value) ?? { total: 0, progressed: 0 }
    current.total += 1
    if (progressedStage(row.stage)) current.progressed += 1
    groupMap.set(value, current)
  }

  const groups = Array.from(groupMap.entries()).map(([value, stats]) => ({
    value,
    total: stats.total,
    progressed: stats.progressed,
    selectionRate: stats.total ? stats.progressed / stats.total : 0,
  }))
  const rates = groups.map((group) => group.selectionRate).filter((rate) => rate > 0)
  if (!rates.length || groups.length < 2) return { ratio: 1, groups }
  const ratio = Math.min(...rates) / Math.max(...rates)
  return { ratio: Number(ratio.toFixed(3)), groups }
}

export async function computeJobBiasAudit(jobId: string, threshold = 0.8): Promise<JobBiasAuditComputation> {
  const apps = await ApplicationModel.find({ job: jobId }, { candidate: 1, stage: 1 }).lean()
  const candidateIds = apps.map((app) => String(app.candidate))
  const protectedAttrs = await ProtectedAttributeModel.find({ candidate: { $in: candidateIds } }).lean()
  const attrMap = Object.fromEntries(protectedAttrs.map((item) => [String(item.candidate), item]))

  const rows = apps.map((app) => ({ candidate: String(app.candidate), stage: app.stage }))
  const gender = computeAttributeParity(rows, attrMap, 'gender')
  const ageRange = computeAttributeParity(rows, attrMap, 'ageRange')
  const ethnicity = computeAttributeParity(rows, attrMap, 'ethnicity')
  const disparateImpact = {
    gender: gender.ratio,
    ageRange: ageRange.ratio,
    ethnicity: ethnicity.ratio,
  }
  const flagged = Object.values(disparateImpact).some((ratio) => ratio < threshold)
  const progressedApplications = rows.filter((row) => progressedStage(row.stage)).length
  const totalApplications = rows.length
  const selectionRate = totalApplications ? progressedApplications / totalApplications : 0

  return {
    disparateImpact,
    flagged,
    details: {
      summary: flagged ? 'Demographic parity check detected a disparity below the configured threshold.' : 'Demographic parity check is within the configured threshold.',
      totalApplications,
      progressedApplications,
      selectionRate: Number(selectionRate.toFixed(3)),
      threshold,
      groups: {
        gender: gender.groups,
        ageRange: ageRange.groups,
        ethnicity: ethnicity.groups,
      },
    },
  }
}
