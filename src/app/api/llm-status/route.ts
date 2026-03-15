import { getProviderStatus } from '@/lib/llm/providers'
import { env } from '@/lib/env'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = await getProviderStatus()
  return Response.json({
    providers: status,
    fallbackAvailable: !!env.GOOGLE_GEMINI_API_KEY,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  })
}
