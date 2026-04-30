import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'

// Layout
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/layout/ProtectedRoute'

// Auth pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import CheckEmail from './pages/auth/CheckEmail'
import Onboarding from './pages/auth/Onboarding'
import RecruiterOnboarding from './pages/auth/RecruiterOnboarding'
import ForgotPassword from './pages/auth/ForgotPassword'
import AcceptInvite from './pages/auth/AcceptInvite'

// Candidate pages
import CandidateDashboard from './pages/candidate/Dashboard'
import JobBoard from './pages/candidate/JobBoard'
import JobDetail from './pages/candidate/JobDetail'
import Applications from './pages/candidate/Applications'
import Assessment from './pages/candidate/Assessment'
import CandidateInterviewRoom from './pages/candidate/InterviewRoom'
import DecisionExplanation from './pages/candidate/DecisionExplanation'

// Recruiter pages
import RecruiterDashboard from './pages/recruiter/Dashboard'
import RecruiterInterviews from './pages/recruiter/Interviews'
import RecruiterJobs from './pages/recruiter/Jobs'
import CreateJob from './pages/recruiter/CreateJob'
import Shortlist from './pages/recruiter/Shortlist'
import QuestionBank from './pages/recruiter/QuestionBank'
import RecruiterInterviewRoom from './pages/recruiter/InterviewRoom'
import FinalSelection from './pages/recruiter/FinalSelection'
import Correspondence from './pages/recruiter/Correspondence'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import AuditLog from './pages/admin/AuditLog'
import BiasAudit from './pages/admin/BiasAudit'
import TeamManagement from './pages/admin/TeamManagement'
import Billing from './pages/admin/Billing'

// Shared
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          {/* Onboarding — requires login but not completed onboarding */}
          <Route element={<ProtectedRoute requireOnboarding={false} />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/recruiter/onboarding" element={<RecruiterOnboarding />} />
          </Route>

          {/* Candidate routes */}
          <Route element={<ProtectedRoute allowedRoles={['candidate']} />}>
            <Route element={<Layout />}>
              <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
              <Route path="/candidate/jobs" element={<JobBoard />} />
              <Route path="/candidate/jobs/:id" element={<JobDetail />} />
              <Route path="/candidate/applications" element={<Applications />} />
              <Route path="/candidate/assessment/:applicationId" element={<Assessment />} />
              <Route path="/candidate/explanation/:id" element={<DecisionExplanation />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            {/* Full-screen interview room */}
            <Route path="/candidate/interview/:id" element={<CandidateInterviewRoom />} />
          </Route>

          {/* Recruiter routes */}
          <Route element={<ProtectedRoute allowedRoles={['recruiter']} />}>
            <Route element={<Layout />}>
              <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
              <Route path="/recruiter/jobs" element={<RecruiterJobs />} />
              <Route path="/recruiter/jobs/create" element={<CreateJob />} />
              <Route path="/recruiter/shortlist" element={<Shortlist />} />
              <Route path="/recruiter/question-bank" element={<QuestionBank />} />
              <Route path="/recruiter/final-selection" element={<FinalSelection />} />
              <Route path="/recruiter/interviews" element={<RecruiterInterviews />} />
              <Route path="/recruiter/correspondence" element={<Correspondence />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            {/* Full-screen interview room */}
            <Route path="/recruiter/interview/:id" element={<RecruiterInterviewRoom />} />
          </Route>

          {/* Admin routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} requireOnboarding={false} />}>
            <Route element={<Layout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/audit-log" element={<AuditLog />} />
              <Route path="/admin/bias-audit" element={<BiasAudit />} />
              <Route path="/admin/team" element={<TeamManagement />} />
              <Route path="/admin/billing" element={<Billing />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
