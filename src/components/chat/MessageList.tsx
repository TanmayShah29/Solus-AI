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
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg) => {
                const isUser = msg.role === "user";

                return (
                    <div
                        key={msg.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${isUser
                                    ? "bg-slate-900 text-white bg-slate-100 text-slate-100"
                                    : "bg-slate-900 text-slate-100 border border-slate-200 bg-slate-900 text-slate-100 border-slate-800"
                                }`}
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
