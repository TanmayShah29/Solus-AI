import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin
  const { data } = await supabase
    .from('tools')
    .select('*')
    .order('name')

  return Response.json({ tools: data ?? [] })
}
