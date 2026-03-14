"use client";

export function ThinkingIndicator({ steps }: { steps: string[] }) {
    if (steps.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 my-2">
            {steps.map((step, idx) => (
                <div key={idx} className="text-white/40 text-xs italic px-2 py-1 flex items-center gap-2">
                    <div className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/20 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white/40"></span>
                    </div>
                    <span>{step}</span>
                </div>
            ))}
        </div>
    );
}
