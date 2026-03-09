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
      const action = args.action as 'search_files' | 'read_file'

      if (action === 'search_files') {
        const params = new URLSearchParams({
          q: `fullText contains '${args.query}' and trashed = false`,
          pageSize: String(args.max_results ?? 5),
          fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
        })

        const res = await googleFetch(
          `https://www.googleapis.com/drive/v3/files?${params}`
        )
        const data = await res.json()

        return Response.json({
          success: true,
          result: data.files ?? [],
          summary: `Found ${data.files?.length ?? 0} files matching "${args.query}"`,
          duration_ms: Date.now() - start,
        })
      }

      if (action === 'read_file') {
        const metaRes = await googleFetch(
          `https://www.googleapis.com/drive/v3/files/${args.file_id}?fields=name,mimeType`
        )
        const meta = await metaRes.json()

        let content = ''
        if (meta.mimeType === 'application/vnd.google-apps.document') {
          const exportRes = await googleFetch(
            `https://www.googleapis.com/drive/v3/files/${args.file_id}/export?mimeType=text/plain`
          )
          content = await exportRes.text()
        } else {
          content = `[Binary file — cannot read inline: ${meta.name}]`
        }

        return Response.json({
          success: true,
          result: { name: meta.name, content: content.slice(0, 4000) },
          summary: `Read file: ${meta.name}`,
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
  { name: 'tool_google_drive' }
)
