// scripts/test-task.ts
import 'dotenv/config'
import { Inngest } from 'inngest'
import { createClient } from '@supabase/supabase-js'
import { env } from '../src/lib/env'

const inngest = new Inngest({ id: 'solus' })

async function main() {
    const taskId = crypto.randomUUID()

    console.log('Creating task in Supabase first...')

    // Initialize generic client for script
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Tasks need to exist in DB before runner picks them up
    const { error: dbError } = await supabase.from('tasks').insert({
        id: taskId,
        user_id: env.MY_USER_ID,
        title: 'DP Study Plan',
        goal: 'Research the best resources for learning dynamic programming and compile a study plan',
        status: 'pending'
    })

    if (dbError) {
        console.error('❌ Failed to create task in DB:', dbError)
        return
    }

    console.log('✅ Task record created. Sending event to Inngest...')

    await inngest.send({
        name: 'solus/task.created',
        data: {
            taskId,
            goal: 'Research the best resources for learning dynamic programming and compile a study plan',
            title: 'DP Study Plan'
        }
    })

    console.log('✅ Event sent. Check http://localhost:8288 for the task-runner function run.')
    console.log('Task ID:', taskId)
}

main().catch(console.error)
