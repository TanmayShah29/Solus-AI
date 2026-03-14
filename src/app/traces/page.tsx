'use client'

export default function TracesPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">📈</div>
        <h1 className="text-xl font-light text-white mb-2">Observability</h1>
        <p className="text-white/40 text-sm mb-8">
          Detailed reasoning traces and tool execution logs are managed in LangSmith.
        </p>
        <a 
          href="https://smith.langchain.com/o/tanmay-shah-29/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-block bg-white text-black px-6 py-2 rounded-full text-sm font-medium transition-all hover:bg-white/80"
        >
          Open LangSmith Dashboard
        </a>
      </div>
    </div>
  )
}
