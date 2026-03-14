'use client'

import dynamic from 'next/dynamic'
import { ChatInterface } from '@/components/chat/ChatInterface'

const SplineScene = dynamic(
  () => import('@/components/ui/splite').then(m => ({ default: m.SplineScene })),
  { ssr: false }
)

export default function Home() {
  return (
    <main className="relative w-full h-screen bg-black overflow-hidden">

      {/* Robot — full screen background */}
      <div className="absolute inset-0 z-0">
        <SplineScene
          scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
          className="w-full h-full"
        />
      </div>

      {/* Bottom gradient so chat reads cleanly over robot */}
      <div className="absolute inset-x-0 bottom-0 h-72 z-10 bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none" />

      {/* Chat — floats over the robot */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col max-h-screen">
        <ChatInterface />
      </div>

    </main>
  )
}
