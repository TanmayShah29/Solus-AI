import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { embedText } from '@/lib/memory/embed'
import { traceable } from 'langsmith/traceable'

export const promoteToKnowledge = traceable(
    async (entity: string, value: string, category: string, confidence: number, userId: string): Promise<void> => {
        const embedding = await embedText(`${entity}: ${value}`)

        // Upsert by entity+category — update if exists
        const { data: existing } = await supabase
            .from('knowledge_facts')
            .select('id, confidence')
            .eq('user_id', userId)
            .eq('entity', entity)
            .eq('category', category)
            .single()

        if (existing) {
            // Only update if new confidence is higher
            if (confidence > existing.confidence) {
                await supabase
                    .from('knowledge_facts')
                    .update({ value, confidence, embedding, updated_at: new Date().toISOString() })
                    .eq('id', existing.id)
            }
        } else {
            await supabase.from('knowledge_facts').insert({
                user_id: userId,
                entity,
                value,
                category,
                confidence,
                embedding,
            })
        }
    },
    { name: 'promote_to_knowledge' }
)
