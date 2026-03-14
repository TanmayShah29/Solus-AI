import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin

  const [memories, facts] = await Promise.allSettled([
    supabase.from('memories').select('id, content, source, created_at').eq('user_id', 'tanmay').order('created_at', { ascending: false }).limit(100),
    supabase.from('knowledge_facts').select('id, entity, value, confidence, created_at').eq('user_id', 'tanmay').order('confidence', { ascending: false }).limit(100),
  ])

  return Response.json({
    memories: memories.status === 'fulfilled' ? (memories.value as any).data ?? [] : [],
    facts: facts.status === 'fulfilled' ? (facts.value as any).data ?? [] : [],
  })
}
