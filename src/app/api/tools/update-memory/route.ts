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
      const { facts, section } = args as {
        facts: string[]       // array of new facts to add
        section: string       // which section to add them under e.g. "About Tanmay"
      }

      if (!facts?.length) {
        return Response.json({ error: 'No facts provided' }, { status: 400 })
      }

      // Read current memory.md
      const { content: currentContent, sha } = await getFile('memory.md')

      // Build the new facts block
      const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      const newFacts = facts.map(f => `- ${f}`).join('\n')
      const newBlock = `\n<!-- Added ${now} IST -->\n${newFacts}`

      // Find the section and append after it
      let updatedContent: string
      const sectionHeader = `## ${section}`

      if (currentContent.includes(sectionHeader)) {
        // Find next section or end of file and insert before it
        const sectionIndex = currentContent.indexOf(sectionHeader)
        const nextSectionIndex = currentContent.indexOf('\n## ', sectionIndex + 1)

        if (nextSectionIndex !== -1) {
          updatedContent =
            currentContent.slice(0, nextSectionIndex) +
            newBlock +
            '\n' +
            currentContent.slice(nextSectionIndex)
        } else {
          updatedContent = currentContent + newBlock + '\n'
        }
      } else {
        // Section doesn't exist — create it at the end
        updatedContent =
          currentContent +
          `\n## ${section}\n` +
          newBlock +
          '\n'
      }

      // Update last updated timestamp
      updatedContent = updatedContent.replace(
        /> Last updated:.*/,
        `> Last updated: ${now} IST`
      )

      // Commit to GitHub
      await updateFile(
        'memory.md',
        updatedContent,
        sha,
        `memory: ${facts.length} new fact(s) in "${section}"`
      )

      return Response.json({
        success: true,
        result: {
          facts_added: facts.length,
          section,
          committed: true,
        },
        summary: `Added ${facts.length} fact(s) to memory under "${section}"`,
        duration_ms: Date.now() - start,
      })
    } catch (error) {
      console.error('update-memory error:', error)
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - start,
      }, { status: 500 })
    }
  },
  { name: 'tool_update_memory' }
)
