import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', 'tanmay')
    .order('created_at', { ascending: false })
    .limit(50)

  return Response.json({ tasks: data ?? [] })
}
