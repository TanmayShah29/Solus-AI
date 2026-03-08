"use client";

export function ThinkingIndicator({ steps }: { steps: string[] }) {
    if (steps.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 my-4 pl-4 border-l-2 border-slate-200 border-slate-800">
            {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm text-slate-500 text-slate-400">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                    </div>
                    <span>{step}</span>
                </div>
            ))}
        </div>
    );
}
