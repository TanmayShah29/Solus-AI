import { env } from '@/lib/env'

export async function getFile(path: string): Promise<{ content: string; sha: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
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
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
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

let memoryCache: { content: string; cachedAt: number } | null = null
const MEMORY_CACHE_TTL = 5 * 60 * 1000

export async function getMemoryFile(): Promise<string> {
  if (memoryCache && Date.now() - memoryCache.cachedAt < MEMORY_CACHE_TTL) {
    return memoryCache.content
  }

  try {
    const { content } = await getFile('memory.md')
    const truncated = content.slice(0, 2000)
    memoryCache = { content: truncated, cachedAt: Date.now() }
    return truncated
  } catch {
    return ''
  }
}
