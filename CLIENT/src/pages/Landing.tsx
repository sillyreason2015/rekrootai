import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="font-serif text-2xl font-bold text-primary">RekrootAI</h1>
          <div className="flex gap-2">
            <Link to="/jobs" className="rounded-md border px-3 py-2 text-sm">Browse Jobs</Link>
            <Link to="/login" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Sign In</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <h2 className="font-serif text-4xl font-semibold">AI Hiring Platform Built For Fair, Explainable Decisions</h2>
          <p className="text-muted-foreground">
            Source talent, assess skills, run fairness gates, and make auditable decisions with recruiter oversight.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Modules</p><p className="text-2xl font-bold">18</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Decision Modes</p><p className="text-2xl font-bold">Veto / Assist / Override</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Explainability</p><p className="text-2xl font-bold">SHAP-backed</p></div>
          </div>
          <div className="flex gap-3">
            <Link to="/jobs" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Explore Open Roles</Link>
            <Link to="/register" className="rounded-md border px-4 py-2">Create Account</Link>
          </div>
        </section>
        <aside className="space-y-3 rounded-xl border bg-card p-5">
          <h3 className="font-serif text-xl font-semibold">What you can do</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Post jobs with weighted scoring thresholds.</li>
            <li>Run structured assessments and interview rubrics.</li>
            <li>Apply fairness checks before final decisions.</li>
            <li>Send candidate correspondence and audit every action.</li>
          </ul>
        </aside>
      </main>
    </div>
  )
}
