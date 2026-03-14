import { env } from '@/lib/env'
import { getFile, updateFile } from '@/lib/github/client'
import { traceable } from 'langsmith/traceable'

export const runtime = 'nodejs'

export const POST = traceable(
  async (req: Request) => {
    const start = Date.now()
    try {
      const authHeader = req.headers.get('Authorization')
      if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { args } = await req.json()
      const { old_fact, new_fact } = args as {
        old_fact: string   // the incorrect fact to find and replace
        new_fact: string   // the corrected fact
      }

      if (!old_fact || !new_fact) {
        return Response.json({ error: 'old_fact and new_fact are required' }, { status: 400 })
      }

      const { content, sha } = await getFile('memory.md')

      // Try exact match first
      if (content.includes(old_fact)) {
        const updated = content.replace(old_fact, new_fact)
        const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        const withTimestamp = updated.replace(
          /> Last updated:.*/,
          `> Last updated: ${now} IST`
        )
        await updateFile('memory.md', withTimestamp, sha, `memory: corrected — "${old_fact}" → "${new_fact}"`)
        return Response.json({
          success: true,
          result: { corrected: true, old_fact, new_fact },
          summary: `Corrected memory: "${old_fact}" → "${new_fact}"`,
          duration_ms: Date.now() - start,
        })
      }

      // Fuzzy: try to find a line containing key words from old_fact
      const lines = content.split('\n')
      const keywords = old_fact.toLowerCase().split(' ').filter(w => w.length > 3)
      const lineIndex = lines.findIndex(line =>
        keywords.filter(kw => line.toLowerCase().includes(kw)).length >= Math.ceil(keywords.length * 0.6)
      )

      if (lineIndex !== -1) {
        lines[lineIndex] = `- ${new_fact}`
        const updated = lines.join('\n')
        const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        const withTimestamp = updated.replace(
          /> Last updated:.*/,
          `> Last updated: ${now} IST`
        )
        await updateFile('memory.md', withTimestamp, sha, `memory: corrected — "${old_fact}" → "${new_fact}"`)
        return Response.json({
          success: true,
          result: { corrected: true, old_fact, new_fact, matched_line: lines[lineIndex] },
          summary: `Corrected memory: "${old_fact}" → "${new_fact}"`,
          duration_ms: Date.now() - start,
        })
      }

      // Not found — add as new fact instead
      return Response.json({
        success: false,
        error: `Could not find "${old_fact}" in memory. Use update_memory to add the new fact instead.`,
        duration_ms: Date.now() - start,
      })

    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - start,
      }, { status: 500 })
    }
  },
  { name: 'tool_correct_memory' }
)
