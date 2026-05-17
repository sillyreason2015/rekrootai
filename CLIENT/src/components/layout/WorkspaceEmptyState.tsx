import { Link } from 'react-router-dom'
import { ArrowRight, Briefcase, FileSearch, Users } from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'

type WorkspaceEmptyStateProps = {
  title: string
  body: string
  cta?: { label: string; to: string }
  secondary?: { label: string; to: string }
  icon?: 'briefcase' | 'users' | 'search'
}

const icons = {
  briefcase: Briefcase,
  users: Users,
  search: FileSearch,
}

export default function WorkspaceEmptyState({
  title,
  body,
  cta,
  secondary,
  icon = 'briefcase',
}: WorkspaceEmptyStateProps) {
  const Icon = icons[icon]

  return (
    <Card>
      <CardContent className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{body}</p>
        {(cta || secondary) && (
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {cta && (
              <Link to={cta.to}>
                <Button size="sm" className="gap-1.5">
                  {cta.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
            {secondary && (
              <Link to={secondary.to}>
                <Button size="sm" variant="outline">{secondary.label}</Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
