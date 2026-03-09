import { env } from "@/lib/env";
import { traceable } from "langsmith/traceable";

/**
 * src/app/api/transcribe/route.ts
 *
 * Server-side route to proxy audio blobs to Groq Whisper.
 * Keeps GROQ_API_KEY secure on the server.
 */

export const POST = traceable(
    async (req: Request) => {
        try {
            const formData = await req.formData();
            const audioFile = formData.get("audio") as File;

            if (!audioFile) {
                return Response.json({ error: "No audio file" }, { status: 400 });
            }

            const groqFormData = new FormData();
            groqFormData.append("file", audioFile, "recording.webm");
            groqFormData.append("model", "whisper-large-v3");
            groqFormData.append("language", "en");

            const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.GROQ_API_KEY}`,
                },
                body: groqFormData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Groq Whisper error:", errorData);
                throw new Error("Groq transcription failed");
            }

            const data = await response.json();
            return Response.json({ text: data.text });
        } catch (error) {
            console.error("Transcription route error:", error);
            return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error" },
                { status: 500 }
            );
        }
    },
    { name: "transcribe_audio" }
);
