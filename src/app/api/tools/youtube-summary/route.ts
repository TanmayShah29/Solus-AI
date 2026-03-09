import { YoutubeTranscript } from 'youtube-transcript'
import { generateText } from 'ai'
import { groq, FAST_MODEL } from '@/lib/groq/client'
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
        if (!args?.url) return Response.json({ error: 'url required' }, { status: 400 })

        // Extract video ID from URL
        const videoId = args.url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/
        )?.[1]
        if (!videoId) return Response.json({ error: 'Invalid YouTube URL' }, { status: 400 })

        // Get transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId)
        const fullText = transcript.map(t => t.text).join(' ').slice(0, 8000)

        // Summarise with Groq
        const { text: summary } = await generateText({
            model: groq(FAST_MODEL),
            prompt: `Summarise this YouTube video transcript in 3-5 bullet points. Be concise and extract the key insights.\n\nTranscript:\n${fullText}`,
        })

        return Response.json({
            success: true,
            result: { videoId, summary, transcript_length: fullText.length },
            summary: `Summarised YouTube video ${videoId}: ${summary.slice(0, 100)}...`,
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
}, { name: 'tool_youtube_summary' })
