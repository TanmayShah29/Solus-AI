'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Memory {
  id: string
  content: string
  source: string
  created_at: string
}

interface KnowledgeFact {
  id: string
  entity: string
  value: string
  confidence: number
  created_at: string
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [facts, setFacts] = useState<KnowledgeFact[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'memories' | 'facts'>('memories')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [memoriesRes, factsRes] = await Promise.allSettled([
        supabase
          .from('memories')
          .select('id, content, source, created_at')
          .eq('user_id', 'tanmay')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('knowledge_facts')
          .select('id, entity, value, confidence, created_at')
          .eq('user_id', 'tanmay')
          .order('confidence', { ascending: false })
          .limit(100),
      ])

      if (memoriesRes.status === 'fulfilled') setMemories(memoriesRes.value.data ?? [])
      if (factsRes.status === 'fulfilled') setFacts(factsRes.value.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredMemories = memories.filter(m =>
    m.content.toLowerCase().includes(search.toLowerCase())
  )

  const filteredFacts = facts.filter(f =>
    f.entity.toLowerCase().includes(search.toLowerCase()) ||
    f.value.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-2xl font-light text-white/80 mb-2">Memory</h1>
      <p className="text-white/30 text-sm mb-6">{memories.length} memories · {facts.length} knowledge facts</p>

      {/* Search */}
      <input
        type="text"
        placeholder="Search memories..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 mb-6"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['memories', 'facts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              activeTab === tab
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {tab === 'memories' ? `Memories (${filteredMemories.length})` : `Facts (${filteredFacts.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'memories' ? (
        <div className="space-y-3 max-w-3xl">
          {filteredMemories.map(m => (
            <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-sm text-white/80">{m.content}</div>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-white/30">{m.source}</span>
                <span className="text-xs text-white/20">
                  {new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {filteredFacts.map(f => (
            <div key={f.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider">{f.entity}</span>
                <div className="text-sm text-white/80 mt-1">{f.value}</div>
              </div>
              <div className="text-xs text-white/30 shrink-0 ml-4">
                {Math.round(f.confidence * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
