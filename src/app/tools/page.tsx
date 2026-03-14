'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Tool {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  auto_approve: boolean
  worker_url: string
}

interface ToolStat {
  tool: string
  calls: number
  failures: number
  failureRate: string
  avgLatencyMs: number
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [stats, setStats] = useState<ToolStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tools')
        .select('*')
        .order('name')

      setTools(data ?? [])

      // Fetch telemetry
      try {
        const res = await fetch('/api/telemetry', {
          headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_TOKEN}` },
        })
        if (res.ok) {
          const telemetry = await res.json()
          setStats(telemetry.stats ?? [])
        }
      } catch {}

      setLoading(false)
    }
    load()
  }, [])

  const getStat = (toolName: string) =>
    stats.find(s => s.tool === toolName.replace(/_/g, '-'))

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-2xl font-light text-white/80 mb-2">Tools</h1>
      <p className="text-white/30 text-sm mb-6">{tools.filter(t => t.enabled).length} active · {tools.length} total</p>

      <div className="space-y-2 max-w-4xl">
        {tools.map(tool => {
          const stat = getStat(tool.name)
          return (
            <div key={tool.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tool.enabled ? 'bg-green-400' : 'bg-white/20'}`} />
                  <span className="text-sm text-white/90 font-mono">{tool.name}</span>
                  <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{tool.category}</span>
                  {tool.auto_approve && (
                    <span className="text-xs text-blue-400/60">auto</span>
                  )}
                </div>
                <div className="text-xs text-white/30 mt-1 ml-4">{tool.description.slice(0, 80)}...</div>
              </div>

              {stat && (
                <div className="flex gap-4 text-xs shrink-0 ml-4">
                  <div className="text-right">
                    <div className="text-white/40">{stat.calls} calls</div>
                    <div className={parseFloat(stat.failureRate) > 20 ? 'text-red-400' : 'text-white/30'}>
                      {stat.failureRate} fail
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/40">{stat.avgLatencyMs}ms</div>
                    <div className="text-white/20">avg</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
