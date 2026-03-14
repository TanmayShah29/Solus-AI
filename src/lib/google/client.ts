import { env } from '@/lib/env'
import { redis } from '@/lib/redis/client'

const TOKEN_CACHE_KEY = 'google:access_token'
const TOKEN_EXPIRY_KEY = 'google:token_expiry'

async function getValidToken(): Promise<string> {
  // Check Redis cache first
  try {
    const [cachedToken, cachedExpiry] = await Promise.all([
      redis.get<string>(TOKEN_CACHE_KEY),
      redis.get<number>(TOKEN_EXPIRY_KEY),
    ])

    if (cachedToken && cachedExpiry && Date.now() < cachedExpiry - 60_000) {
      return cachedToken
    }
  } catch (err) {
    console.error('Google token Redis cache error:', err)
    // Redis unavailable — fall through to refresh
  }

  // Refresh the token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh Google token: ${error}`)
  }

  const data = await response.json()
  const newToken: string = data.access_token
  const expiresAt: number = Date.now() + data.expires_in * 1000

  // Cache in Redis for next invocation
  try {
    await Promise.all([
      redis.set(TOKEN_CACHE_KEY, newToken, { ex: data.expires_in - 60 }),
      redis.set(TOKEN_EXPIRY_KEY, expiresAt, { ex: data.expires_in - 60 }),
    ])
  } catch (err) {
    console.error('Google token Redis cache write error:', err)
    // Redis write failed — token still works for this invocation
  }

  return newToken
}

export async function googleFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getValidToken()
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}
