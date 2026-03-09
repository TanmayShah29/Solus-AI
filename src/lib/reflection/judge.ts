import { generateObject } from 'ai'
import { groq, FAST_MODEL } from '@/lib/groq/client'
import { z } from 'zod'
import { traceable } from 'langsmith/traceable'

const JudgeResultSchema = z.object({
    score: z.number().min(1).max(10),
    keep: z.boolean(),
    reason: z.string(),
    entity: z.string().optional(),
    value: z.string().optional(),
    category: z.enum(['preference', 'fact', 'goal', 'relationship', 'habit', 'context', 'other']),
})

export type JudgeResult = z.infer<typeof JudgeResultSchema>

export const judgeFact = traceable(
    async (fact: string, context: string): Promise<JudgeResult> => {
        const { object } = await generateObject({
            model: groq(FAST_MODEL),
            schema: JudgeResultSchema,
            prompt: `You are a memory judge for a personal AI assistant. Evaluate this extracted fact for quality and usefulness.

Fact: "${fact}"
Context: "${context}"

Score from 1-10 based on:
- Specificity (vague = low, specific = high)
- Usefulness for future conversations
- Uniqueness (don't keep generic facts)
- Personal relevance

Set keep=true if score >= 7.
Extract the entity (subject) and value (what we learned) if clear.
Categorise it accurately.`,
        })
        return object
    },
    { name: 'judge_fact' }
)
