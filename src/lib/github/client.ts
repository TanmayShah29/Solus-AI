import { env } from '@/lib/env'

const GITHUB_API = 'https://api.github.com'

export async function getFile(path: string): Promise<{ content: string; sha: string }> {
  const response = await fetch(
    `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (!response.ok) throw new Error(`GitHub getFile failed: ${response.status}`)

  const data = await response.json()
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { content, sha: data.sha }
}

export async function updateFile(
  path: string,
  content: string,
  sha: string,
  commitMessage: string
): Promise<void> {
  const encoded = Buffer.from(content, 'utf-8').toString('base64')

  const response = await fetch(
    `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: encoded,
        sha,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GitHub updateFile failed: ${response.status} — ${error}`)
  }
}

// Cache memory.md in memory for 5 minutes to avoid GitHub rate limits
let memoryCache: { content: string; cachedAt: number } | null = null
const MEMORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getMemoryFile(): Promise<string> {
  if (memoryCache && Date.now() - memoryCache.cachedAt < MEMORY_CACHE_TTL) {
    return memoryCache.content
  }

  try {
    const { content } = await getFile('memory.md')
    memoryCache = { content, cachedAt: Date.now() }
    return content
  } catch (error) {
    console.error('Failed to load memory.md:', error)
    return '' // graceful degradation — don't crash if GitHub is unreachable
  }
}
