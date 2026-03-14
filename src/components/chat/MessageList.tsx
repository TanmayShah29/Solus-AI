"use client";

import { Message } from "ai";
import { useEffect, useRef } from "react";

export function MessageList({ messages }: { messages: Message[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500">
                <p>Start a conversation with Solus</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {messages.map((msg) => {
                const isUser = msg.role === "user";

                return (
                    <div
                        key={msg.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={isUser
                                ? "ml-auto max-w-[80%] px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md text-white text-sm border border-white/10"
                                : "mr-auto max-w-[80%] px-4 py-2 rounded-2xl bg-black/40 backdrop-blur-md text-white/90 text-sm border border-white/5"
                            }
                        >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
