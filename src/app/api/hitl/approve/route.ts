import { inngest } from '@/inngest/client'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { traceable } from 'langsmith/traceable'

export const POST = traceable(
    async (req: Request) => {
        // 1. Validate Secret Token
        const authHeader = req.headers.get('Authorization')
        if (!authHeader || authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Read and Validate Body
        const body = await req.json()
        const { taskId, approved } = body

        if (!taskId || typeof approved !== 'boolean') {
            return Response.json({ error: 'Missing taskId or approved status' }, { status: 400 })
        }

        const supabase = await createClient()

        // 3. Send Inngest resume event
        await inngest.send({
            name: 'solus/task.approved',
            data: {
                taskId,
                approved,
            }
        })

        // 4. Updates the task status in Supabase
        const { error } = await supabase
            .from('tasks')
            .update({
                status: approved ? 'running' : 'failed',
                ...(approved ? {} : { result: { reason: 'rejected by user' } })
            })
            .eq('id', taskId)

        if (error) {
            console.error('Failed to update task status:', error)
            // We don't return 500 here because the Inngest event was sent, 
            // but maybe worth noting.
        }

        // 5. Return clean response
        return Response.json({
            success: true,
            taskId,
            action: approved ? 'approved' : 'rejected'
        })
    },
    { name: 'hitl_approval' }
)
