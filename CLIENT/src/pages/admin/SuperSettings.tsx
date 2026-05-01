import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export default function SuperSettings() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">Platform Settings</h1>
      <Card><CardHeader><CardTitle>System Controls</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">This panel is reserved for global platform toggles (maintenance mode, model policies, provider keys, and compliance controls).</CardContent></Card>
    </div>
  )
}
