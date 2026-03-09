import { generateObject } from 'ai'
import { groq, FAST_MODEL } from '@/lib/groq/client'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { embedText } from '@/lib/memory/embed'
import { traceable } from 'langsmith/traceable'

const PersonSchema = z.object({
    name: z.string(),
    relationship: z.string(),
    notes: z.string(),
    shouldStore: z.boolean(),
})

export const extractAndStorePerson = traceable(
    async (conversation: string, userId: string): Promise<void> => {
        const { object } = await generateObject({
            model: groq(FAST_MODEL),
            schema: PersonSchema,
            prompt: `Extract information about a real person mentioned in this conversation.
Only extract if a specific named person is mentioned with relationship context.
Set shouldStore=false if no clear person is mentioned.

Conversation: "${conversation}"`,
        })

        if (!object.shouldStore) return

        const embedding = await embedText(object.notes)

        // Upsert — update if person exists, insert if new
        const { data: existing } = await supabase
            .from('people')
            .select('id, notes')
            .eq('user_id', userId)
            .ilike('name', object.name)
            .single()

        if (existing) {
            await supabase
                .from('people')
                .update({
                    notes: `${existing.notes}\n${object.notes}`.slice(0, 1000),
                    embedding,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
        } else {
            await supabase.from('people').insert({
                user_id: userId,
                name: object.name,
                relationship: object.relationship,
                notes: object.notes,
                embedding,
            })
        }
    },
    { name: 'extract_and_store_person' }
)
