import { env } from '@/lib/env'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    try {
        const formData = await req.formData()
        const audioFile = formData.get('audio') as File | null

        if (!audioFile) {
            return Response.json({ error: 'No audio file provided' }, { status: 400 })
        }

        const groqFormData = new FormData()
        groqFormData.append('file', audioFile, 'recording.wav')
        groqFormData.append('model', 'whisper-large-v3')
        groqFormData.append('language', 'en')
        groqFormData.append('response_format', 'json')

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            },
            body: groqFormData,
        })

        if (!response.ok) {
            const error = await response.text()
            console.error('Groq Whisper error:', error)
            return Response.json({ error: 'Transcription failed' }, { status: 500 })
        }

        const data = await response.json()
        return Response.json({ text: data.text })

    } catch (error) {
        console.error('Transcribe route error:', error)
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
