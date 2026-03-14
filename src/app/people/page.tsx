'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Person {
  id: string
  name: string
  relationship: string
  notes: string
  sentiment: string
  last_discussed: string | null
  next_followup: string | null
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('people')
        .select('*')
        .eq('user_id', 'tanmay')
        .order('last_discussed', { ascending: false, nullsFirst: false })
      setPeople(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const sentimentColor = (s: string) => {
    if (s === 'positive') return 'text-green-400'
    if (s === 'negative') return 'text-red-400'
    return 'text-white/40'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-2xl font-light text-white/80 mb-2">People</h1>
      <p className="text-white/30 text-sm mb-6">{people.length} people in graph</p>

      {people.length === 0 ? (
        <div className="text-white/20 text-sm">
          No people in the graph yet. Mention someone in conversation and Solus will remember them.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {people.map(person => (
            <div key={person.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-white/90">{person.name}</div>
                  <div className="text-xs text-white/40">{person.relationship}</div>
                </div>
                {person.sentiment && (
                  <span className={`text-xs ${sentimentColor(person.sentiment)}`}>
                    {person.sentiment}
                  </span>
                )}
              </div>
              {person.notes && (
                <div className="text-xs text-white/50 mt-3 leading-relaxed">{person.notes}</div>
              )}
              {person.last_discussed && (
                <div className="text-xs text-white/20 mt-3">
                  Last discussed: {new Date(person.last_discussed).toLocaleDateString('en-IN')}
                </div>
              )}
              {person.next_followup && (
                <div className="text-xs text-blue-400/60 mt-1">
                  Follow up: {person.next_followup}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
