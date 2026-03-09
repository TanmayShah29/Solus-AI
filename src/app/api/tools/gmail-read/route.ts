import { env } from '@/lib/env'
import { googleFetch } from '@/lib/google/client'
import { traceable } from 'langsmith/traceable'

export const POST = traceable(
  async (req: Request) => {
    const start = Date.now()
    try {
      const authHeader = req.headers.get('Authorization')
      if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { args } = await req.json()
      const action = args.action as 'list_inbox' | 'search_emails' | 'read_thread'

      if (action === 'list_inbox' || action === 'search_emails') {
        const query = action === 'search_emails' ? args.query : 'in:inbox is:unread'

        const params = new URLSearchParams({
          q: query,
          maxResults: String(args.max_results ?? 5),
        })

        const listRes = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`
        )
        const listData = await listRes.json()
        const messageIds: string[] = (listData.messages ?? []).map((m: any) => m.id)

        const messages = await Promise.all(
          messageIds.map(async (id) => {
            const msgRes = await googleFetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
            )
            const msg = await msgRes.json()
            const headers = msg.payload?.headers ?? []
            const get = (name: string) => headers.find((h: any) => h.name === name)?.value ?? ''

            return {
              id: msg.id,
              threadId: msg.threadId,
              subject: get('Subject'),
              from: get('From'),
              date: get('Date'),
              snippet: msg.snippet,
            }
          })
        )

        return Response.json({
          success: true,
          result: messages,
          summary: `Found ${messages.length} emails. Latest: "${messages[0]?.subject ?? 'none'}" from ${messages[0]?.from ?? 'unknown'}`,
          duration_ms: Date.now() - start,
        })
      }

      if (action === 'read_thread') {
        const threadRes = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${args.thread_id}?format=metadata`
        )
        const thread = await threadRes.json()

        const messages = (thread.messages ?? []).map((msg: any) => {
          const headers = msg.payload?.headers ?? []
          const get = (name: string) => headers.find((h: any) => h.name === name)?.value ?? ''
          return {
            from: get('From'),
            date: get('Date'),
            snippet: msg.snippet,
          }
        })

        return Response.json({
          success: true,
          result: messages,
          summary: `Thread has ${messages.length} messages.`,
          duration_ms: Date.now() - start,
        })
      }

      return Response.json({ error: 'Unknown action' }, { status: 400 })
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - start,
      }, { status: 500 })
    }
  },
  { name: 'tool_gmail_read' }
)
