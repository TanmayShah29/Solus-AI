"use client";

import { useChat } from "ai/react";
import { MessageList } from "./MessageList";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useEffect, useState, useRef, useCallback } from "react";
import { loadVoices, speak, stopSpeaking, getIsSpeaking } from "@/lib/speech/tts";
import dynamic from "next/dynamic";

const VoiceOrb = dynamic(
    () => import("./VoiceOrb").then(m => m.VoiceOrb),
    { ssr: false }
);

export function ChatInterface() {
    const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(false);
    const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);

    // Ref to track latest assistant message for VoiceOrb
    const lastAssistantMessage = useRef("");

    const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, data } = useChat({
        api: "/api/chat",
        onFinish: (message) => {
            // In Advanced Mode, VoiceOrb handles playback via assistantMessage prop
            // But for manual text input, we might still want voice output if enabled
            if (isVoiceOutputEnabled && !getIsSpeaking()) {
                speak(message.content);
            }
        }
    });

    // Update last assistant message ref
    useEffect(() => {
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") {
            lastAssistantMessage.current = last.content;
        }
    }, [messages]);

    useEffect(() => {
        loadVoices();
    }, []);

    useEffect(() => {
        if (!isLoading) {
            setThinkingSteps([]);
            return;
        }
        if (data) {
            const steps = data
                .filter((d: any) => d && d.type === "thinking" && d.step)
                .map((d: any) => d.step as string);
            setThinkingSteps(steps);
        }
    }, [data, isLoading]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !isLoading) {
                const syntheticEvent = {
                    preventDefault: () => { },
                } as React.FormEvent<HTMLFormElement>;
                handleSubmit(syntheticEvent);
            }
        }
    };

    const handleTranscription = useCallback((text: string) => {
        setInput(text);

        // Auto-submit transcribed text
        setTimeout(() => {
            const syntheticEvent = {
                preventDefault: () => { },
            } as React.FormEvent<HTMLFormElement>;
            handleSubmit(syntheticEvent, { body: { message: text } });
        }, 50);
    }, [handleSubmit, setInput]);

    return (
        <div className="flex flex-col h-full w-full max-w-3xl mx-auto border-x border-slate-800 bg-slate-950/50 relative">
            {/* Header / Voice Toggle */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                    onClick={() => {
                        const newState = !isVoiceOutputEnabled;
                        setIsVoiceOutputEnabled(newState);
                        if (!newState) stopSpeaking();
                    }}
                    className={`p-2 rounded-lg transition-colors ${isVoiceOutputEnabled ? "text-blue-400 bg-blue-400/10" : "text-slate-500 hover:text-slate-300"}`}
                    title={isVoiceOutputEnabled ? "Voice Output On" : "Voice Output Off"}
                >
                    {isVoiceOutputEnabled ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.026.328A11.916 11.916 0 0 1 21 12c0 2.307-.653 4.462-1.79 6.3a11.992 11.992 0 0 1-1.026 1.494.75.75 0 0 1-1.213-.882 10.437 10.437 0 0 0 1.083-1.363C19.141 15.603 19.5 13.842 19.5 12c0-1.841-.359-3.602-1.083-5.155a.75.75 0 0 1 .167-.887l.001-.001Z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06Z" />
                            <path d="M18.75 1.5a.75.75 0 0 0-1.5 0v21a.75.75 0 0 0 1.5 0V1.5Z" />
                        </svg>
                    )}
                </button>
            </div>

            <MessageList messages={messages} />

            <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
                <ThinkingIndicator steps={thinkingSteps} />

                <form onSubmit={handleSubmit} className="relative flex items-end gap-2 shadow-sm rounded-xl overflow-hidden border border-slate-800 bg-slate-900 focus-within:ring-2 focus-within:ring-slate-700 transition-shadow">
                    <textarea
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={onKeyDown}
                        disabled={isLoading}
                        placeholder="Message Solus..."
                        className="flex-1 max-h-48 min-h-[56px] resize-none overflow-y-auto px-4 py-4 bg-transparent focus:outline-none text-slate-100 disabled:opacity-50"
                        rows={1}
                    />

                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="mb-2 mr-2 shrink-0 rounded-lg p-2 text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                </form>
            </div>

            {/* Jarvis Orb Overlay */}
            <VoiceOrb
                onTranscription={handleTranscription}
                assistantMessage={lastAssistantMessage.current}
                isLoading={isLoading}
            />
        </div>
    );
}
