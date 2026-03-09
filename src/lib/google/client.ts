import { env } from '@/lib/env'

interface TokenResponse {
  access_token: string
  expires_in: number
}

let cachedToken = env.GOOGLE_ACCESS_TOKEN ?? ''
let tokenExpiry = 0

async function getValidToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) {
    return cachedToken
  }

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

  if (!response.ok) throw new Error('Failed to refresh Google token')

  const data: TokenResponse = await response.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + data.expires_in * 1000

  return cachedToken
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
