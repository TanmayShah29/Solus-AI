import { inngest } from '@/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getFile, updateFile } from '@/lib/github/client'

export const memorySync = inngest.createFunction(
  { id: 'memory-sync', name: 'Memory Sync' },
  { cron: '0 18 * * *' }, // midnight IST (18:00 UTC)
  async ({ step }) => {

    const newFacts = await step.run('fetch-new-facts', async () => {
      const supabase = supabaseAdmin
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data } = await supabase
        .from('knowledge_facts')
        .select('entity, value, confidence')
        .eq('user_id', 'tanmay')
        .gte('confidence', 0.8)
        .gte('created_at', yesterday)
        .order('confidence', { ascending: false })
        .limit(20)

      return data ?? []
    })

    if (!newFacts.length) return { skipped: 'no new high-confidence facts' }

    await step.run('update-memory-md', async () => {
      const { content, sha } = await getFile('memory.md')

      const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      const newEntries = newFacts
        .map(f => `- ${f.entity}: ${f.value} (confidence: ${Math.round(f.confidence * 100)}%)`)
        .join('\n')

      const block = `\n<!-- Synced from Supabase ${now} IST -->\n${newEntries}`

      // Append to Knowledge Facts section or end of file
      const updated = content.includes('## Knowledge Facts')
        ? content.replace(
            /## Knowledge Facts\n/,
            `## Knowledge Facts\n${block}\n`
          )
        : content + `\n## Knowledge Facts\n${block}\n`

      const withTimestamp = updated.replace(
        /> Last updated:.*/,
        `> Last updated: ${now} IST`
      )

      await updateFile(
        'memory.md',
        withTimestamp,
        sha,
        `memory: sync ${newFacts.length} knowledge facts from Supabase`
      )
    })

    return { synced: newFacts.length }
  }
)
