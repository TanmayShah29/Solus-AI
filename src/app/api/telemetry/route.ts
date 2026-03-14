import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('tool_executions')
    .select('tool_name, success, duration_ms, created_at')
    .eq('user_id', 'tanmay')
    .gte('created_at', sevenDaysAgo)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return Response.json({ stats: [], period: '7 days', total: 0 })
  }

  const statsMap = data.reduce((acc: Record<string, { calls: number; failures: number; totalMs: number }>, row) => {
    if (!acc[row.tool_name]) acc[row.tool_name] = { calls: 0, failures: 0, totalMs: 0 }
    acc[row.tool_name].calls++
    if (!row.success) acc[row.tool_name].failures++
    acc[row.tool_name].totalMs += row.duration_ms ?? 0
    return acc
  }, {})

  const stats = Object.entries(statsMap).map(([name, s]) => ({
    tool: name,
    calls: s.calls,
    failures: s.failures,
    failureRate: `${((s.failures / s.calls) * 100).toFixed(1)}%`,
    avgLatencyMs: Math.round(s.totalMs / s.calls),
  })).sort((a, b) => b.calls - a.calls)

  return Response.json({ stats, period: '7 days', total: data.length })
}
