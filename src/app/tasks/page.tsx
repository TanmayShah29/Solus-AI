'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Task {
  id: string
  title: string
  goal: string
  status: string
  current_step: number
  steps: { description: string }[]
  created_at: string
  completed_at: string | null
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', 'tanmay')
        .order('created_at', { ascending: false })
        .limit(50)
      setTasks(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return t.status !== 'completed'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400'
      case 'running': return 'text-blue-400'
      case 'failed': return 'text-red-400'
      default: return 'text-white/40'
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-2xl font-light text-white/80 mb-6">Tasks</h1>

      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm capitalize transition-all ${
              filter === f ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-w-3xl">
        {filtered.map(task => (
          <div key={task.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-white/90">{task.title}</div>
                <div className="text-xs text-white/40 mt-1">{task.goal}</div>
              </div>
              <span className={`text-xs capitalize shrink-0 ml-4 ${statusColor(task.status)}`}>
                {task.status}
              </span>
            </div>

            {task.steps?.length > 0 && (
              <div className="mt-4 space-y-1">
                {task.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={i < task.current_step ? 'text-green-400' : i === task.current_step ? 'text-blue-400' : 'text-white/20'}>
                      {i < task.current_step ? '✓' : i === task.current_step ? '▶' : '○'}
                    </span>
                    <span className={i <= task.current_step ? 'text-white/60' : 'text-white/20'}>
                      {step.description}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-white/20 mt-3">
              {new Date(task.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-white/20 text-sm text-center py-12">No tasks.</div>
        )}
      </div>
    </div>
  )
}
