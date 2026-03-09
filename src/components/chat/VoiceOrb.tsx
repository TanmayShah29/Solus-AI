/**
 * src/components/chat/VoiceOrb.tsx
 *
 * Jarvis-style Voice Interface component.
 * Pulsing orb with three states: Idle (gray), Listening (blue), Speaking (green).
 * Handles VAD lifecycle, transcription POST, and TTS integration.
 */

'use client';

import { useState, useEffect, useCallback } from "react";
import { startVAD, stopVAD, float32ToWav } from "@/lib/speech/vad";
import { speak, stopSpeaking } from "@/lib/speech/tts";

type VoiceOrbProps = {
    onTranscription: (text: string) => void;
    assistantMessage: string;
    isLoading: boolean;
};

type VoiceState = "idle" | "listening" | "speaking" | "processing";

export function VoiceOrb({ onTranscription, assistantMessage, isLoading }: VoiceOrbProps) {
    const [state, setState] = useState<VoiceState>("idle");

    // Start voice conversation mode
    const activate = async () => {
        setState("listening");
        await startVAD({
            onSpeechStart: () => {
                stopSpeaking();
                setState("listening");
            },
            onSpeechEnd: async (audio) => {
                setState("processing");
                try {
                    const wav = float32ToWav(audio);
                    const formData = new FormData();
                    formData.append("audio", wav);

                    const res = await fetch("/api/transcribe", {
                        method: "POST",
                        body: formData,
                    });

                    if (!res.ok) throw new Error("Transcription failed");

                    const { text } = await res.json();
                    if (text && text.trim()) {
                        onTranscription(text);
                    } else {
                        setState("listening");
                    }
                } catch (error) {
                    console.error("Transcribe error:", error);
                    setState("listening");
                }
            }
        });
    };

    const deactivate = () => {
        stopVAD();
        stopSpeaking();
        setState("idle");
    };

    // Auto-play assistant responses when in voice mode
    useEffect(() => {
        if (state !== "idle" && assistantMessage && !isLoading) {
            setState("speaking");
            speak(assistantMessage, () => {
                // Return to listening when Solus stops talking
                setState("listening");
            });
        }
    }, [assistantMessage, isLoading, state]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopVAD();
            stopSpeaking();
        };
    }, []);

    return (
        <div className="fixed bottom-24 right-8 z-50 flex flex-col items-center gap-2">
            {state !== "idle" && (
                <div className="text-xs font-mono text-slate-500 uppercase tracking-widest animate-pulse">
                    {state}
                </div>
            )}

            <button
                onClick={state === "idle" ? activate : deactivate}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl relative group ${ScaleClasses[state]
                    } ${BgClasses[state]}`}
            >
                {/* Visual pulse rings */}
                {state !== "idle" && (
                    <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${RingClasses[state]}`} />
                )}

                {state === "idle" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-400 group-hover:text-slate-100 transition-colors">
                        <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                        <path d="M6 10.5a.75.75 0 0 1 .75.75 5.25 5.25 0 1 0 10.5 0 .75.75 0 0 1 1.5 0 6.75 6.75 0 0 1-6 6.709V21h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-3.041a6.75 6.75 0 0 1-6-6.709.75.75 0 0 1 .75-.75Z" />
                    </svg>
                ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce-slow" />
                )}
            </button>

            {state !== "idle" && (
                <button
                    onClick={deactivate}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors uppercase font-bold tracking-tighter"
                >
                    ESC to close
                </button>
            )}
        </div>
    );
}

const BgClasses = {
    idle: "bg-slate-800 border-2 border-slate-700",
    listening: "bg-blue-600 border-2 border-blue-400 shadow-blue-500/40",
    speaking: "bg-emerald-600 border-2 border-emerald-400 shadow-emerald-500/40",
    processing: "bg-amber-600 border-2 border-amber-400 shadow-amber-500/40",
};

const RingClasses = {
    idle: "",
    listening: "bg-blue-400",
    speaking: "bg-emerald-400",
    processing: "bg-amber-400",
};

const ScaleClasses = {
    idle: "hover:scale-110",
    listening: "scale-110",
    speaking: "scale-125",
    processing: "scale-110 animate-pulse",
};
