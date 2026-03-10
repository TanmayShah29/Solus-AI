"use client";

import { useChat } from "ai/react";
import { MessageList } from "./MessageList";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useEffect, useState, useRef } from "react";
import { useVoiceConversation } from "@/lib/speech/useVoiceConversation";

export function ChatInterface() {
    const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const lastAssistantMessageRef = useRef<string>("");

    const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, data } = useChat({
        api: "/api/chat",
    });

    const { voiceState, activate, deactivate, speakResponse } = useVoiceConversation({
        enabled: voiceEnabled,
        onTranscription: (text) => {
            setInput(text);
            // Auto-submit transcribed text
            setTimeout(() => {
                const syntheticEvent = {
                    preventDefault: () => { },
                } as React.FormEvent<HTMLFormElement>;
                handleSubmit(syntheticEvent);
            }, 50);
        },
    });

    // Watch for new assistant messages and speak them
    useEffect(() => {
        if (!voiceEnabled) return;
        const lastMessage = messages[messages.length - 1];
        if (
            lastMessage?.role === "assistant" &&
            lastMessage.content !== lastAssistantMessageRef.current &&
            !isLoading
        ) {
            lastAssistantMessageRef.current = lastMessage.content;
            speakResponse(lastMessage.content);
        }
    }, [messages, isLoading, voiceEnabled, speakResponse]);

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

    return (
        <div className="flex flex-col h-full w-full max-w-3xl mx-auto border-x border-slate-800 bg-slate-950/50 relative">
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

                    <div className="flex items-center gap-2 mb-2 mr-2">
                        <button
                            type="button"
                            onClick={voiceEnabled ? deactivate : activate}
                            className={`rounded-full p-2 transition-all ${voiceEnabled
                                    ? voiceState === 'listening' ? 'bg-blue-500 animate-pulse'
                                        : voiceState === 'speaking' ? 'bg-green-500 animate-pulse'
                                            : voiceState === 'thinking' ? 'bg-yellow-500 animate-pulse'
                                                : 'bg-blue-500'
                                    : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                                }`}
                            title={voiceEnabled ? `Voice: ${voiceState}` : 'Activate voice'}
                        >
                            {voiceEnabled ? '🎙️' : '🎤'}
                        </button>

                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="shrink-0 rounded-lg p-2 text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
