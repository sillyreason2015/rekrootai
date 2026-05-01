import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { TourProvider } from './contexts/TourContext'

// Layout
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AuthRedirect from './components/layout/AuthRedirect'

// Auth pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import CheckEmail from './pages/auth/CheckEmail'
import Onboarding from './pages/auth/Onboarding'
import RecruiterOnboarding from './pages/auth/RecruiterOnboarding'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
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
import RecruiterAuditLog from './pages/recruiter/AuditLog'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import AuditLog from './pages/admin/AuditLog'
import BiasAudit from './pages/admin/BiasAudit'
import TeamManagement from './pages/admin/TeamManagement'
import Billing from './pages/admin/Billing'
import AdminCandidates from './pages/admin/Candidates'
import SuperDashboard from './pages/admin/SuperDashboard'
import SuperUsers from './pages/admin/SuperUsers'
import SuperCompanies from './pages/admin/SuperCompanies'
import SuperSettings from './pages/admin/SuperSettings'
import AIValidation from './pages/admin/AIValidation'
import LiveKitTest from './pages/admin/LiveKitTest'

// Shared
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import Landing from './pages/Landing'
import PublicJobBoard from './pages/PublicJobBoard'
import PublicJobDetail from './pages/PublicJobDetail'
import Help from './pages/Help'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TourProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/jobs" element={<PublicJobBoard />} />
          <Route path="/jobs/:id" element={<PublicJobDetail />} />
          <Route path="/" element={<Landing />} />
          <Route path="/help" element={<Help />} />
          <Route path="/redirect" element={<AuthRedirect />} />

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
              <Route path="/recruiter/shortlist" element={<Shortlist />} />
              <Route path="/recruiter/audit-log" element={<RecruiterAuditLog />} />
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
              <Route path="/admin/candidates" element={<AdminCandidates />} />
              <Route path="/admin/team" element={<TeamManagement />} />
              <Route path="/admin/billing" element={<Billing />} />
              <Route path="/admin/jobs/create" element={<CreateJob />} />
              <Route path="/admin/ai-validation" element={<AIValidation />} />
              <Route path="/admin/livekit-test" element={<LiveKitTest />} />
              <Route path="/admin/bias-audit" element={<BiasAudit />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Hidden internal super-admin routes (not linked in normal nav) */}
          <Route element={<ProtectedRoute allowedRoles={['super_admin']} requireOnboarding={false} />}>
            <Route element={<Layout />}>
              <Route path="/internal/super-admin/dashboard" element={<SuperDashboard />} />
              <Route path="/internal/super-admin/users" element={<SuperUsers />} />
              <Route path="/internal/super-admin/companies" element={<SuperCompanies />} />
              <Route path="/internal/super-admin/audit-log" element={<AuditLog />} />
              <Route path="/internal/super-admin/bias-audit" element={<BiasAudit />} />
              <Route path="/internal/super-admin/settings" element={<SuperSettings />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TourProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
