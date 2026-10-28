import { NextResponse, type NextRequest } from 'next/server'

/**
 * src/proxy.ts
 *
 * Single gate in front of every page and API route.
 *
 * - Browsers sign in once with HTTP Basic auth (SOLUS_DASHBOARD_PASSWORD).
 *   After that the proxy forwards the request with the server-side
 *   API_SECRET_TOKEN, so the secret never has to ship to the browser.
 * - Server-to-server calls (tool router, Inngest jobs) keep using
 *   `Authorization: Bearer API_SECRET_TOKEN` and pass straight through.
 * - Telegram and Inngest webhooks are excluded in `config.matcher`;
 *   they verify their own signatures.
 */

const REALM = 'Basic realm="Solus", charset="UTF-8"'

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': REALM },
  })
}

export function proxy(req: NextRequest) {
  const apiSecret = process.env.API_SECRET_TOKEN
  const password = process.env.SOLUS_DASHBOARD_PASSWORD

  // Fail closed: without both secrets configured nothing gets in.
  if (!apiSecret || !password) {
    return new NextResponse('Solus is not configured', { status: 503 })
  }

  const auth = req.headers.get('authorization') ?? ''

  // Internal callers already hold the server secret.
  if (safeEqual(auth, `Bearer ${apiSecret}`)) return NextResponse.next()

  if (auth.startsWith('Basic ')) {
    let decoded = ''
    try {
      decoded = atob(auth.slice(6))
    } catch {
      return unauthorized()
    }
    const given = decoded.slice(decoded.indexOf(':') + 1)

    if (safeEqual(given, password)) {
      // Swap the browser's credentials for the server secret so the
      // existing per-route Bearer checks keep working unchanged.
      const headers = new Headers(req.headers)
      headers.set('authorization', `Bearer ${apiSecret}`)
      return NextResponse.next({ request: { headers } })
    }
  }

  return unauthorized()
}

export const config = {
  matcher: [
    '/((?!api/channels/telegram|api/inngest|_next/static|_next/image|favicon.ico).*)',
  ],
}
