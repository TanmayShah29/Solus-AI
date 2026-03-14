import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supabaseAdmin
  const { data } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', 'tanmay')
    .order('last_discussed', { ascending: false, nullsFirst: false })

  return Response.json({ people: data ?? [] })
}
