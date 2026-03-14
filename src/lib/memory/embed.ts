import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Generates an embedding for a piece of text by calling the Supabase `embed` Edge Function.
 * - Model: Xenova/all-MiniLM-L6-v2
 * - Output dimensions: 384
 * - Note: The first cold invocation may take a few seconds as it initializes the model.
 * Subsequent warm invocations take ~100ms.
 */
export async function embedText(text: string): Promise<number[]> {
    const { data, error } = await supabaseAdmin.functions.invoke("embed", {
        body: { text },
    });

    if (error) {
        throw new Error(`Failed to generate embedding: ${error.message}`);
    }

    if (data?.error) {
        throw new Error(`Edge function returned error: ${data.error}`);
    }

    if (!data?.embedding || data.dimensions !== 384) {
        throw new Error(
            `Invalid embedding response. Expected 384 dimensions, got ${data?.dimensions}.`
        );
    }

    return data.embedding as number[];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => embedText(text)));
}
