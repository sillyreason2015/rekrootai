import { CompanyModel } from '../models/Company.model.js'
import { JobModel } from '../models/Job.model.js'
import { UserModel } from '../models/User.model.js'

export interface WorkspaceScope {
  me: {
    _id: string
    companyName?: string
    teamName?: string
    role?: string
    firstName?: string
    lastName?: string
  } | null
  companyId: string | null
  company: {
    _id: string
    name?: string
    legalName?: string
    teamName?: string
    logoUrl?: string
    createdBy?: string
  } | null
  companyNames: string[]
  canonicalCompanyName: string | null
  teamName: string | null
}

export async function resolveWorkspaceScope(userId: string): Promise<WorkspaceScope> {
  const me = await UserModel.findById(userId, { companyName: 1, teamName: 1, role: 1, firstName: 1, lastName: 1 }).lean()
  const rawCompanyName = me?.companyName?.trim()
  const rawTeamName = me?.teamName?.trim()

  const ownedCompany = await CompanyModel.findOne({
    $or: [
      { createdBy: userId },
      ...(rawCompanyName ? [{ name: rawCompanyName }, { legalName: rawCompanyName }] : []),
    ],
  }).lean()

  const company = ownedCompany ?? null
  const companyNames = [company?.name, company?.legalName, rawCompanyName]
    .filter((value): value is string => Boolean(value?.trim()))
  const teamName = rawTeamName || company?.teamName?.trim() || company?.name?.trim() || rawCompanyName || null

  return {
    me: me
      ? {
          _id: String(me._id),
          companyName: me.companyName,
          teamName: me.teamName,
          role: me.role,
          firstName: me.firstName,
          lastName: me.lastName,
        }
      : null,
    companyId: company?._id ? String(company._id) : null,
    company: company
      ? {
          _id: String(company._id),
          name: company.name,
          legalName: company.legalName,
          teamName: company.teamName,
          logoUrl: company.logoUrl,
          createdBy: company.createdBy,
        }
      : null,
    companyNames: [...new Set(companyNames)],
    canonicalCompanyName: company?.name ?? company?.legalName ?? rawCompanyName ?? null,
    teamName,
  }
}

export function buildTeamScopedUserFilter(scope: Pick<WorkspaceScope, 'companyNames' | 'teamName'>) {
  const filter: Record<string, unknown> = {}
  if (scope.companyNames.length) filter.companyName = { $in: scope.companyNames }
  if (scope.teamName) filter.teamName = scope.teamName
  return filter
}

export function buildTeamScopedJobFilter(scope: Pick<WorkspaceScope, 'companyId' | 'teamName'>, fallbackUserId: string) {
  const filter: Record<string, unknown> = scope.companyId ? { company: scope.companyId } : { createdBy: fallbackUserId }
  if (scope.teamName) filter.teamName = scope.teamName
  return filter
}

export async function findAssignableRecruiters(userId: string) {
  const scope = await resolveWorkspaceScope(userId)
  const userFilter = buildTeamScopedUserFilter(scope)
  const recruiters = await UserModel.find(
    {
      role: { $in: ['recruiter', 'admin', 'super_admin'] },
      ...(Object.keys(userFilter).length ? userFilter : { _id: userId }),
    },
    { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1 },
  )
    .sort({ createdAt: 1, _id: 1 })
    .lean()

  return { scope, recruiters }
}

export async function pickRoundRobinRecruiter(userId: string) {
  const { scope, recruiters } = await findAssignableRecruiters(userId)
  if (!recruiters.length) return { scope, recruiters, assignedRecruiter: null }

  const recentJob = scope.companyId
    ? await JobModel.findOne({
        company: scope.companyId,
        ...(scope.teamName ? { teamName: scope.teamName } : {}),
        assignedRecruiter: { $in: recruiters.map((recruiter) => String(recruiter._id)) },
      })
        .sort({ createdAt: -1 })
        .lean()
    : null

  const lastAssignedIndex = recentJob?.assignedRecruiter
    ? recruiters.findIndex((recruiter) => String(recruiter._id) === String(recentJob.assignedRecruiter))
    : -1
  const nextRecruiter = recruiters[(lastAssignedIndex + 1) % recruiters.length]

  return {
    scope,
    recruiters,
    assignedRecruiter: nextRecruiter
      ? {
          _id: String(nextRecruiter._id),
          firstName: nextRecruiter.firstName,
          lastName: nextRecruiter.lastName,
          email: nextRecruiter.email,
          role: nextRecruiter.role,
        }
      : null,
  }
}
