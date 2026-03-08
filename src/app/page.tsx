import { ChatInterface } from "@/components/chat/ChatInterface";

export default function Home() {
  return (
    <main className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-950">
      {/* Minimal Header */}
      <header className="shrink-0 flex items-baseline justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 relative z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight text-white">Solus</h1>
          <span className="text-sm font-medium text-slate-400">
            Personal AI Agent
          </span>
        </div>
      </header>

      {/* Chat Interface Container (takes remaining height) */}
      <div className="flex-1 overflow-hidden relative">
        <ChatInterface />
      </div>
    </main>
  );
}
