const targets = [
  { name: 'server-health', url: 'http://localhost:4000/health' },
  { name: 'ml-health', url: 'http://localhost:8000/health' },
]

const run = async () => {
  let failed = 0
  for (const t of targets) {
    try {
      const r = await fetch(t.url)
      if (!r.ok) {
        failed++
        console.log(`[FAIL] ${t.name} -> ${r.status}`)
        continue
      }
      const body = await r.json().catch(() => ({}))
      console.log(`[OK] ${t.name} -> ${r.status} ${JSON.stringify(body)}`)
    } catch (e) {
      failed++
      console.log(`[FAIL] ${t.name} -> ${String(e)}`)
    }
  }
  if (failed) process.exit(1)
}

run()
