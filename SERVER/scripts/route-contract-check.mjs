import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), '..')

const routeFiles = {
  '/auth': 'SERVER/src/routes/auth.routes.ts',
  '/candidates': 'SERVER/src/routes/candidate.routes.ts',
  '/jobs': 'SERVER/src/routes/jobs.routes.ts',
  '/applications': 'SERVER/src/routes/applications.routes.ts',
  '/assessments': 'SERVER/src/routes/assessments.routes.ts',
  '/interviews': 'SERVER/src/routes/interviews.routes.ts',
  '/admin': 'SERVER/src/routes/admin.routes.ts',
  '/recruiter': 'SERVER/src/routes/recruiter.routes.ts',
  '/notifications': 'SERVER/src/routes/notifications.routes.ts',
  '/companies': 'SERVER/src/routes/company.routes.ts',
  '/question-bank': 'SERVER/src/routes/questionbank.routes.ts',
  '/anonymize': 'SERVER/src/routes/anonymize.routes.ts',
}

const clientRoots = [
  'CLIENT/src/services',
  'CLIENT/src/pages',
  'CLIENT/src/contexts',
  'CLIENT/src/components',
]

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

function normalizeRoute(route) {
  const withParams = route
    .replace(/['"`]\s*\+\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\+\s*['"`]/g, '/:param/')
    .replace(/\/([A-Za-z_$][A-Za-z0-9_$]*)\//g, (full, segment) => {
      if (['auth', 'candidates', 'jobs', 'applications', 'assessments', 'interviews', 'admin', 'recruiter', 'notifications', 'companies', 'question-bank', 'anonymize'].includes(segment)) {
        return `/${segment}/`
      }
      if (/id$/i.test(segment) || /[A-Z]/.test(segment)) return '/:param/'
      return full
    })

  return withParams
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/['"`]/g, '')
    .replace(/\s*\+\s*/g, '')
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
}

function parseServerRoutes() {
  const routes = new Set()
  for (const [mount, relPath] of Object.entries(routeFiles)) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8')
    const regex = /\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g
    for (const match of source.matchAll(regex)) {
      routes.add(`${match[1].toUpperCase()} ${normalizeRoute(`${mount}${match[2]}`)}`)
    }
  }
  return routes
}

function parseClientCalls() {
  const calls = []
  for (const relRoot of clientRoots) {
    const absRoot = path.join(root, relRoot)
    for (const file of walk(absRoot)) {
      const source = fs.readFileSync(file, 'utf8')
      const directRegex = /api\.(get|post|patch|put|delete)\(\s*([`'"][^`'"]+[`'"]|`[^`]+`|'[^']+'\s*\+\s*[^,)]+|"[^"]+"\s*\+\s*[^,)]+)/g
      for (const match of source.matchAll(directRegex)) {
        const route = normalizeRoute(match[2])
        calls.push({ method: match[1].toUpperCase(), route, file })
      }
    }
  }
  return calls
}

const serverRoutes = parseServerRoutes()
const clientCalls = parseClientCalls()
const missing = clientCalls.filter(({ method, route }) => !serverRoutes.has(`${method} ${route}`))

console.log(`Server routes: ${serverRoutes.size}`)
console.log(`Client API calls: ${clientCalls.length}`)

if (missing.length) {
  console.log('\nMissing or mismatched client contracts:')
  for (const item of missing) {
    console.log(`- ${item.method} ${item.route} :: ${path.relative(root, item.file)}`)
  }
  process.exit(1)
}

console.log('\nNo missing client/server route contracts detected.')
