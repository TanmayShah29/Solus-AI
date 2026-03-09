import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { traceable } from 'langsmith/traceable'
import crypto from 'crypto'

// Parse natural language duration to milliseconds
function parseDuration(duration: string): number {
    const d = duration.toLowerCase().trim()

    const patterns: [RegExp, number][] = [
        [/(\d+)\s*s(ec(ond)?s?)?/, 1000],
        [/(\d+)\s*min(ute)?s?/, 60 * 1000],
        [/(\d+)\s*h(our)?s?/, 60 * 60 * 1000],
        [/(\d+)\s*d(ay)?s?/, 24 * 60 * 60 * 1000],
    ]

    for (const [pattern, multiplier] of patterns) {
        const match = d.match(pattern)
        if (match) return parseInt(match[1]) * multiplier
    }

    throw new Error(`Could not parse duration: "${duration}"`)
}

export const POST = traceable(async (req: Request) => {
    const start = Date.now()
    try {
        const secret = req.headers.get('authorization')
        if (secret !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { args } = await req.json()
        if (!args?.message || !args?.duration) {
            return Response.json({ error: 'message and duration required' }, { status: 400 })
        }

        const delayMs = parseDuration(args.duration)
        const reminderId = crypto.randomUUID()

        // Calculate when reminder will fire
        const fireAt = new Date(Date.now() + delayMs)
        const fireAtIST = fireAt.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })

        await inngest.send({
            name: 'solus/reminder.created',
            data: { message: args.message, delayMs, reminderId }
        })

        return Response.json({
            success: true,
            result: { reminderId, fireAt: fireAt.toISOString(), fireAtIST },
            summary: `Reminder set for ${fireAtIST} IST: "${args.message}"`,
            duration_ms: Date.now() - start,
        })
    } catch (error) {
        return Response.json({
            success: false,
            result: null,
            summary: `Tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration_ms: Date.now() - start,
        }, { status: 500 })
    }
}, { name: 'tool_set_reminder' })
