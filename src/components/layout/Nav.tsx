'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Chat', icon: '💬' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/memory', label: 'Memory', icon: '🧠' },
  { href: '/people', label: 'People', icon: '👥' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
  { href: '/tools', label: 'Tools', icon: '🔧' },
  { href: '/traces', label: 'Traces', icon: '📈' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="fixed left-0 top-0 h-full w-14 bg-black/80 backdrop-blur-md border-r border-white/5 flex flex-col items-center py-6 gap-4 z-50">
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white mb-4">
        S
      </div>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          title={link.label}
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all hover:bg-white/10 ${
            pathname === link.href ? 'bg-white/15 ring-1 ring-white/20' : ''
          }`}
        >
          {link.icon}
        </Link>
      ))}
    </nav>
  )
}
