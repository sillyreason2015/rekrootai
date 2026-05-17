import type { Candidate, ExperienceEntry, EducationEntry, Job } from '../domain.js'
import { env } from '../config/env.js'

type ParsedCvData = {
  fileName: string
  extracted: boolean
  textPreview: string
  maskedCV: string
  anonymization: string
  inferredSkills: string[]
  inferredExperience: ExperienceEntry[]
  inferredEducation: EducationEntry[]
}

const KNOWN_SKILLS = [
  'javascript', 'typescript', 'react', 'node', 'node.js', 'express', 'mongodb', 'sql', 'python',
  'java', 'c#', 'aws', 'azure', 'docker', 'kubernetes', 'git', 'html', 'css', 'tailwind',
  'project management', 'figma', 'ui/ux', 'data analysis', 'communication', 'leadership',
]

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function inferSkillsFromCv(text: string): string[] {
  const lower = text.toLowerCase()
  return uniqueStrings(
    KNOWN_SKILLS.filter((skill) => lower.includes(skill)).map((skill) =>
      skill === 'node.js' ? 'Node.js' : skill.split(' ').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
    ),
  )
}

export function inferExperienceFromCv(text: string): ExperienceEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const entries: ExperienceEntry[] = []
  for (let index = 0; index < lines.length - 1 && entries.length < 4; index += 1) {
    const titleLine = lines[index]
    const companyLine = lines[index + 1]
    if (!/[A-Za-z]/.test(titleLine) || !/[A-Za-z]/.test(companyLine)) continue
    if (titleLine.length > 70 || companyLine.length > 70) continue
    if (!/[A-Z]/.test(titleLine[0] ?? '')) continue
    entries.push({
      title: titleLine.slice(0, 80),
      company: companyLine.slice(0, 80),
      startDate: '',
      endDate: '',
      current: /present|current/i.test(companyLine),
      description: '',
    })
  }
  return entries
}

export function inferEducationFromCv(text: string): EducationEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const degreePattern = /(b\.?sc|bachelor|m\.?sc|master|phd|doctorate|degree|diploma)/i
  const entries: EducationEntry[] = []
  for (let index = 0; index < lines.length - 1 && entries.length < 3; index += 1) {
    const first = lines[index]
    const second = lines[index + 1]
    if (!degreePattern.test(first) && !degreePattern.test(second)) continue
    entries.push({
      institution: degreePattern.test(first) ? second.slice(0, 80) : first.slice(0, 80),
      degree: degreePattern.test(first) ? first.slice(0, 80) : second.slice(0, 80),
      field: '',
      startDate: '',
      endDate: '',
      current: false,
    })
  }
  return entries
}

export function buildParsedCvData(fileName: string, rawText: string, masked: string): ParsedCvData {
  return {
    fileName,
    extracted: Boolean(rawText),
    textPreview: rawText ? masked.slice(0, 350) : 'Uploaded successfully. Parsing pipeline pending.',
    maskedCV: rawText ? masked : '',
    anonymization: rawText ? 'applied' : 'pending_non_text_parse',
    inferredSkills: rawText ? inferSkillsFromCv(rawText) : [],
    inferredExperience: rawText ? inferExperienceFromCv(rawText) : [],
    inferredEducation: rawText ? inferEducationFromCv(rawText) : [],
  }
}

/**
 * Uses Gemini to extract structured experience, education, skills and headline
 * from raw CV text. Falls back to keyword inference if Gemini is unavailable.
 */
export async function extractStructuredProfileFromCv(rawText: string): Promise<{
  skills: string[]
  experience: ExperienceEntry[]
  education: EducationEntry[]
  headline: string
}> {
  const fallback = {
    skills: inferSkillsFromCv(rawText),
    experience: inferExperienceFromCv(rawText),
    education: inferEducationFromCv(rawText),
    headline: '',
  }
  if (!env.GEMINI_API_KEY || !rawText) return fallback

  const prompt = `Extract structured profile data from this CV. Return ONLY valid JSON with these keys:
- "headline": string — a 1-line professional headline (e.g. "Senior Software Engineer · 5 yrs experience")
- "skills": string[] — up to 15 technical and soft skills
- "experience": array of objects with keys: title (string), company (string), startDate (string YYYY-MM or ""), endDate (string YYYY-MM or ""), current (boolean), description (string, max 120 chars)
- "education": array of objects with keys: institution (string), degree (string), field (string), startDate (string YYYY-MM or ""), endDate (string YYYY-MM or ""), current (boolean)

CV text (anonymised):
${rawText.slice(0, 3000)}

Respond ONLY with valid JSON. No markdown fences.`

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(text)
    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline : '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(String).slice(0, 20) : fallback.skills,
      experience: Array.isArray(parsed.experience) ? parsed.experience.slice(0, 8) : fallback.experience,
      education: Array.isArray(parsed.education) ? parsed.education.slice(0, 5) : fallback.education,
    }
  } catch {
    return fallback
  }
}

export function mergeCandidateWithCv(candidate: Candidate, cvParsed: ParsedCvData) {
  // Skills: always union existing + newly inferred
  const mergedSkills = uniqueStrings([...(candidate.skills ?? []), ...(cvParsed.inferredSkills ?? [])])
  // Experience/Education: prefer CV-inferred when it has entries; keep existing if CV yields nothing
  const mergedExp = cvParsed.inferredExperience?.length
    ? cvParsed.inferredExperience
    : (candidate.experience ?? [])
  const mergedEdu = cvParsed.inferredEducation?.length
    ? cvParsed.inferredEducation
    : (candidate.education ?? [])
  return { skills: mergedSkills, experience: mergedExp, education: mergedEdu }
}

export function scoreCandidateForJob(candidate: Candidate, job: Pick<Job, 'skills' | 'requirements' | 'title' | 'department'>) {
  const profileSkills = (candidate.skills ?? []).map((skill) => skill.toLowerCase())
  const cvText = String((candidate.cvParsed as Record<string, unknown> | undefined)?.maskedCV ?? '').toLowerCase()
  const jobTerms = uniqueStrings([
    ...(job.skills ?? []),
    ...(job.requirements ?? []),
    job.title ?? '',
    job.department ?? '',
  ].join(' ').toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').split(/\s+/))

  if (!jobTerms.length) return 0

  const profileHits = profileSkills.filter((skill) => jobTerms.includes(skill.toLowerCase())).length
  const cvHits = jobTerms.filter((term) => term.length > 2 && cvText.includes(term)).length
  const experienceBoost = Math.min((candidate.experience?.length ?? 0) * 4, 20)

  const normalized = Math.min(100, Math.round(((profileHits * 10) + (cvHits * 4) + experienceBoost)))
  return normalized
}
