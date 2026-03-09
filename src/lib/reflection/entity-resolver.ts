import { generateObject } from 'ai'
import { groq, FAST_MODEL } from '@/lib/groq/client'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { traceable } from 'langsmith/traceable'

const ResolutionSchema = z.object({
    isDuplicate: z.boolean(),
    canonicalName: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
})

export const resolveEntity = traceable(
    async (newEntity: string, userId: string): Promise<{ isDuplicate: boolean; existingId?: string; canonicalName?: string }> => {
        // No createClient call here

        // Get existing people
        const { data: existingPeople } = await supabase
            .from('people')
            .select('id, name, notes')
            .eq('user_id', userId)
            .limit(50)

        if (!existingPeople?.length) return { isDuplicate: false }

        const { object } = await generateObject({
            model: groq(FAST_MODEL),
            schema: ResolutionSchema,
            prompt: `Does "${newEntity}" refer to the same person as any of these existing entries?

Existing people:
${existingPeople.map((p: any) => `- ${p.name}: ${p.notes || 'no notes'}`).join('\n')}

Consider nicknames, partial names, and contextual references.
If it's a duplicate, provide the canonical (best) name to use.`,
        })

        if (object.isDuplicate && object.confidence > 0.8) {
            const match = existingPeople.find((p: any) =>
                p.name.toLowerCase().includes(object.canonicalName?.toLowerCase() ?? '') ||
                object.canonicalName?.toLowerCase().includes(p.name.toLowerCase())
            )
            return {
                isDuplicate: true,
                existingId: match?.id,
                canonicalName: object.canonicalName,
            }
        }

        return { isDuplicate: false }
    },
    { name: 'resolve_entity' }
)
