import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, FAST_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'

export const qualityScorer = inngest.createFunction(
  { id: 'quality-scorer', name: 'Response Quality Scorer' },
  { event: 'solus/response.generated' },
  async ({ event, step }) => {
    const { userMessage, assistantResponse, sessionId } = event.data

    const score = await step.run('score-response', async () => {
      const prompt = `Score this AI assistant response for "Jarvis fidelity" on a scale of 1-10.

Jarvis rules:
- Short sentences. Direct. No padding.
- Never says: certainly, absolutely, of course, great question, happy to help
- Never repeats back what the user said
- Never asks more than one question
- Dry wit when appropriate — never forced
- Addresses user directly — never third person
- Delivers information without framing it

User message: "${userMessage}"
Assistant response: "${assistantResponse}"

Respond in JSON only:
{
  "score": 8,
  "violations": ["repeated user's statement back", "asked two questions"],
  "strengths": ["concise", "direct"],
  "verdict": "one sentence assessment"
}`

      const { text } = await generateText({
        model: groq(FAST_MODEL),
        prompt,
      })

      try {
        const clean = text.replace(/```json|```/g, '').trim()
        return JSON.parse(clean)
      } catch {
        return { score: 5, violations: [], strengths: [], verdict: 'Parse failed' }
      }
    })

    // Store score in Supabase
    await step.run('store-score', async () => {
      const supabase = supabaseAdmin
      await supabase.from('conversations').update({
        tool_calls: {
          quality_score: score.score,
          violations: score.violations,
          strengths: score.strengths,
          verdict: score.verdict,
        }
      })
      .eq('user_id', 'tanmay')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
    })

    return score
  }
)
