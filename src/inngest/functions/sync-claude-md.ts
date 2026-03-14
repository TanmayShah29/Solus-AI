import { inngest } from '@/inngest/client'
import { getFile, updateFile } from '@/lib/github/client'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const syncClaudeMd = inngest.createFunction(
  { id: 'sync-claude-md', name: 'Sync CLAUDE.md' },
  { event: 'solus/claude.sync' },
  async ({ step }) => {

    const tools = await step.run('fetch-tools', async () => {
      const supabase = supabaseAdmin
      const { data } = await supabase
        .from('tools')
        .select('name, category, enabled, worker_url')
        .order('name')
      return data ?? []
    })

    await step.run('update-claude-md', async () => {
      const { content, sha } = await getFile('CLAUDE.md')

      // Update the tools registry section
      const toolsTable = [
        '| Tool | Category | Route | Enabled |',
        '|---|---|---|---|',
        ...tools.map(t => `| ${t.name} | ${t.category} | ${t.worker_url} | ${t.enabled ? '✅' : '❌'} |`),
      ].join('\n')

      // Find and replace the tools table in CLAUDE.md
      const updated = content.replace(
        /(\| Tool \| Category \|.*\n)(\|[-|]+\|\n)([\s\S]*?)(\n##)/,
        `${toolsTable}\n\n##`
      )

      if (updated !== content) {
        const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        await updateFile(
          'CLAUDE.md',
          updated,
          sha,
          `docs: auto-sync CLAUDE.md tool registry — ${now} IST`
        )
      }
    })

    return { synced: true, toolCount: tools.length }
  }
)
