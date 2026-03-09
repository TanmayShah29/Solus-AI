import { env } from '@/lib/env'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return new Response('No code returned from Google', { status: 400 })
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenResponse.json()

  return new Response(
    `<pre style="font-family:monospace;padding:2rem;font-size:14px">
GOOGLE_ACCESS_TOKEN="${tokens.access_token}"
GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"

Copy these into your .env.local and restart the dev server.
    </pre>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
