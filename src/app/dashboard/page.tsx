'use client'

import { useEffect, useState } from 'react'

interface Stats {
  totalMemories: number
  totalConversations: number
  activeTasks: number
  activeGoals: number
  totalToolExecutions: number
  recentMemories: { content: string; created_at: string }[]
  recentExecutions: { tool_name: string; success: boolean; duration_ms: number; created_at: string }[]
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [llmStatus, setLlmStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      const [statsRes, statusRes] = await Promise.all([
        fetch('/api/dashboard/stats', {
          headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_TOKEN}` }
        }),
        fetch('/api/llm-status', {
          headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_TOKEN}` }
        }).then(r => r.json()).catch(() => null)
      ])

      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
      }
      setLlmStatus(statusRes)
      setLoading(false)
    }

    loadStats()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-2xl font-light text-white/80 mb-8">Dashboard</h1>

      {llmStatus && (
        <div className="flex gap-4 mb-8">
          {Object.entries(llmStatus.providers as Record<string, boolean>).map(([provider, up]) => (
            <div key={provider} className="flex items-center gap-2 text-sm bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <span className={`w-2 h-2 rounded-full ${up ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-white/50 capitalize">{provider}</span>
              <span className={up ? 'text-green-400' : 'text-red-400'}>{up ? 'up' : 'down'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {[
          { label: 'Memories', value: stats?.totalMemories },
          { label: 'Conversations', value: stats?.totalConversations },
          { label: 'Active Tasks', value: stats?.activeTasks },
          { label: 'Active Goals', value: stats?.activeGoals },
          { label: 'Tool Calls', value: stats?.totalToolExecutions },
        ].map(stat => (
          <div key={stat.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-3xl font-light text-white">{stat.value ?? 0}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent memories */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm text-white/40 uppercase tracking-wider mb-4">Recent Memories</h2>
          <div className="space-y-3">
            {stats?.recentMemories.map((m, i) => (
              <div key={i} className="text-sm text-white/70 border-b border-white/5 pb-3 last:border-0">
                <div>{m.content}</div>
                <div className="text-xs text-white/30 mt-1">
                  {new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tool executions */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm text-white/40 uppercase tracking-wider mb-4">Recent Tool Calls</h2>
          <div className="space-y-2">
            {stats?.recentExecutions.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={e.success ? 'text-green-400' : 'text-red-400'}>
                    {e.success ? '✓' : '✗'}
                  </span>
                  <span className="text-white/70">{e.tool_name}</span>
                </div>
                <span className="text-white/30 text-xs">{e.duration_ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
