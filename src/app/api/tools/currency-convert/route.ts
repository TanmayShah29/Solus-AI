import { env } from '@/lib/env'
import { traceable } from 'langsmith/traceable'
import { getCached, setCached } from '@/lib/redis/client';

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

        const from = args.from.toUpperCase();
        const to = args.to.toUpperCase();
        const cacheKey = `currency:${from}-${to}`;
        const cached = await getCached<any>(cacheKey);
        
        if (cached) {
            const converted = (args.amount * cached.rate).toFixed(2);
            return Response.json({
                ...cached,
                amount: args.amount,
                converted: parseFloat(converted),
                summary: `${args.amount} ${from} = ${converted} ${to} (rate: ${cached.rate})`,
                cached: true,
                duration_ms: Date.now() - start
            });
        }

        const response = await fetch(
            `https://api.exchangerate-api.com/v4/latest/${from}`
        )
        if (!response.ok) throw new Error('Exchange rate fetch failed')

        const data = await response.json()
        const rate = data.rates[to]
        if (!rate) throw new Error(`Currency ${to} not found`)

        const result = {
            success: true,
            result: {
                from,
                to,
                rate,
                date: data.date,
            },
        }

        await setCached(cacheKey, result.result, 15 * 60) // 15 minute TTL

        const converted = (args.amount * rate).toFixed(2)

        return Response.json({
            ...result,
            result: {
                ...result.result,
                amount: args.amount,
                converted: parseFloat(converted),
            },
            summary: `${args.amount} ${from} = ${converted} ${to} (rate: ${rate})`,
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
