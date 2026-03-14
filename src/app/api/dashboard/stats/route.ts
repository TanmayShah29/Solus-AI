import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin

  const [memories, conversations, tasks, goals, executions, recentMemories, recentExecutions] =
    await Promise.allSettled([
      supabase.from('memories').select('*', { count: 'exact', head: true }).eq('user_id', 'tanmay'),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', 'tanmay'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', 'tanmay').eq('status', 'pending'),
      supabase.from('goals').select('*', { count: 'exact', head: true }).eq('user_id', 'tanmay').eq('status', 'active'),
      supabase.from('tool_executions').select('*', { count: 'exact', head: true }).eq('user_id', 'tanmay'),
      supabase.from('memories').select('content, created_at').eq('user_id', 'tanmay').order('created_at', { ascending: false }).limit(5),
      supabase.from('tool_executions').select('tool_name, success, duration_ms, created_at').eq('user_id', 'tanmay').order('created_at', { ascending: false }).limit(10),
    ])

  return Response.json({
    totalMemories: memories.status === 'fulfilled' ? (memories.value as any).count ?? 0 : 0,
    totalConversations: conversations.status === 'fulfilled' ? (conversations.value as any).count ?? 0 : 0,
    activeTasks: tasks.status === 'fulfilled' ? (tasks.value as any).count ?? 0 : 0,
    activeGoals: goals.status === 'fulfilled' ? (goals.value as any).count ?? 0 : 0,
    totalToolExecutions: executions.status === 'fulfilled' ? (executions.value as any).count ?? 0 : 0,
    recentMemories: recentMemories.status === 'fulfilled' ? (recentMemories.value as any).data ?? [] : [],
    recentExecutions: recentExecutions.status === 'fulfilled' ? (recentExecutions.value as any).data ?? [] : [],
  })
}
