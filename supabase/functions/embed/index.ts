import { pipeline, env } from 'https://esm.sh/@xenova/transformers@2.17.2'

// Configuration for Deno runtime
env.useBrowserCache = false
env.allowLocalModels = false

// Cache the pipeline across warm invocations
let embedder: any = null

async function getEmbedder() {
    if (!embedder) {
        embedder = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        )
    }
    return embedder
}

Deno.serve(async (req) => {
    try {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'authorization, content-type',
                }
            })
        }

        const { text } = await req.json()

        if (!text || typeof text !== 'string') {
            return new Response(
                JSON.stringify({ error: 'text field required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const embed = await getEmbedder()
        const output = await embed(text, { pooling: 'mean', normalize: true })
        const embedding = Array.from(output.data) as number[]

        return new Response(
            JSON.stringify({ embedding, dimensions: embedding.length }),
            { headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})
