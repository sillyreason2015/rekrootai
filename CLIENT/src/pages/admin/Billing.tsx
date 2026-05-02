import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, Zap, Check } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

const PLANS = [
  {
    name: 'Starter',
    price: '₦0',
    period: '/month',
    features: ['5 active jobs', '100 applications/mo', 'Basic AI scoring', 'Email support'],
    cta: 'Current Plan',
    active: true,
  },
  {
    name: 'Growth',
    price: '₦49,000',
    period: '/month',
    features: ['25 active jobs', 'Unlimited applications', 'Full AI scoring + SHAP', 'Bias audit reports', 'Priority support'],
    cta: 'Upgrade',
    active: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited jobs', 'Dedicated infrastructure', 'Custom ML models', 'SLA guarantee', '24/7 support'],
    cta: 'Contact Sales',
    active: false,
  },
]

export default function Billing() {
  const [selectedPlan, setSelectedPlan] = useState<string>(() => localStorage.getItem('billing_selected_plan') ?? 'Starter')
  const [message, setMessage] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-billing'],
    queryFn: adminService.getBilling,
  })

  if (isLoading) return <LoadingSpinner />

  const billing = data as {
    plan?: string
    usage?: { jobs: number; applications: number; aiCalls: number }
    nextBillingDate?: string
  } | undefined

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription and usage.</p>
      </div>

      {/* Usage summary */}
      {billing?.usage && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Active Jobs', value: billing.usage.jobs, icon: TrendingUp },
            { label: 'Applications', value: billing.usage.applications, icon: CreditCard },
            { label: 'AI Calls', value: billing.usage.aiCalls, icon: Zap },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold">{value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Plans */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.name} className={plan.active ? 'border-primary ring-1 ring-primary' : ''}>
            {plan.active && (
              <div className="flex justify-center pt-3">
                <Badge>Current Plan</Badge>
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                  plan.name === selectedPlan
                    ? 'bg-muted text-muted-foreground cursor-default'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                disabled={plan.name === selectedPlan}
                onClick={() => {
                  localStorage.setItem('billing_selected_plan', plan.name)
                  setSelectedPlan(plan.name)
                  setMessage(plan.name === 'Enterprise' ? 'Sales request opened. Team will contact you.' : `${plan.name} selected and saved.`)
                  setTimeout(() => setMessage(''), 3000)
                }}
              >
                {plan.name === selectedPlan ? 'Current Plan' : plan.cta}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
      {message && <p className="text-sm text-primary">{message}</p>}

      {billing?.nextBillingDate && (
        <p className="text-sm text-muted-foreground">
          Next billing date: <strong>{new Date(billing.nextBillingDate).toLocaleDateString()}</strong>
        </p>
      )}
    </div>
  )
}
