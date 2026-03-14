"use client";

import { useChat } from "ai/react";
import { MessageList } from "./MessageList";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useVoiceConversation } from "@/lib/speech/useVoiceConversation";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";

export function ChatInterface() {
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const lastAssistantMessageRef = useRef<string>("");

    const { messages, input, setInput, append, isLoading, data } = useChat({
        api: "/api/chat",
    });

    const handleTranscription = useCallback((text: string) => {
        const trimmed = text.trim();
        if (trimmed) {
            append({ role: "user", content: trimmed });
        }
    }, [append]);

    const handleToggleVoice = useCallback(() => {
        setVoiceEnabled(prev => !prev);
    }, []);

    const { voiceState, activate, deactivate, speakResponse } = useVoiceConversation({
        enabled: voiceEnabled,
        onTranscription: handleTranscription,
    });

    // Sync VAD with voiceEnabled state
    useEffect(() => {
        if (voiceEnabled) {
            activate();
        } else {
            deactivate();
        }
    }, [voiceEnabled, activate, deactivate]);

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

    const thinkingSteps = useMemo(() => {
        if (!isLoading || !data) return [];
        return data
            .filter((d: any) => d && d.type === "thinking" && d.step)
            .map((d: any) => d.step as string);
    }, [data, isLoading, messages]); // messages added as suggested to ensure re-renders during turns

    return (
        <div className="flex flex-col w-full bg-transparent">
            {/* Scrollable message list */}
            <div className="flex-1 overflow-y-auto max-h-[60vh] px-4 pb-2 space-y-3 scrollbar-none">
                <MessageList messages={messages} />
            </div>

            {/* Input pinned to bottom */}
            <div className="px-4 pb-6 pt-2">
                <ThinkingIndicator steps={thinkingSteps} />

                <PromptInputBox
                    onSend={async (message, files) => {
                        const trimmed = message.trim();
                        if (trimmed || (files && files.length > 0)) {
                            const attachments = files?.map(file => ({
                                name: file.name,
                                contentType: file.type,
                                url: URL.createObjectURL(file), // Temporary URL for preview
                            }));

                            append({ 
                                role: 'user', 
                                content: trimmed,
                                experimental_attachments: attachments as any
                            });
                        }
                    }}
                    isLoading={isLoading}
                    placeholder="Ask Solus anything..."
                    onMicClick={handleToggleVoice}
                    voiceState={voiceState}
                />
            </div>
        </div>
    );
}
