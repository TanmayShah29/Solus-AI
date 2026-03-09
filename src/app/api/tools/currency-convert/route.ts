import { env } from '@/lib/env'
import { traceable } from 'langsmith/traceable'

export const POST = traceable(async (req: Request) => {
    const start = Date.now()
    try {
        const secret = req.headers.get('authorization')
        if (secret !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { args } = await req.json()
        if (!args?.from || !args?.to || !args?.amount) {
            return Response.json({ error: 'from, to, and amount required' }, { status: 400 })
        }

        const response = await fetch(
            `https://api.exchangerate-api.com/v4/latest/${args.from.toUpperCase()}`
        )
        if (!response.ok) throw new Error('Exchange rate fetch failed')

        const data = await response.json()
        const rate = data.rates[args.to.toUpperCase()]
        if (!rate) throw new Error(`Currency ${args.to} not found`)

        const converted = (args.amount * rate).toFixed(2)

        return Response.json({
            success: true,
            result: {
                from: args.from.toUpperCase(),
                to: args.to.toUpperCase(),
                amount: args.amount,
                converted: parseFloat(converted),
                rate,
                date: data.date,
            },
            summary: `${args.amount} ${args.from.toUpperCase()} = ${converted} ${args.to.toUpperCase()} (rate: ${rate})`,
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
}, { name: 'tool_currency_convert' })
