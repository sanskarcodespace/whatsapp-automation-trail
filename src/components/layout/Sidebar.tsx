'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, LayoutDashboard, Users, Calendar,
  Settings, LogOut, ChevronLeft, ChevronRight, Building2,
  PhoneCall, FileDown, Bot, ChevronDown, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const NAV = [
  { href: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/inbox',         icon: MessageSquare,   label: 'Inbox' },
  { href: '/leads',         icon: Users,           label: 'Leads' },
  { href: '/appointments',  icon: Calendar,        label: 'Appointments' },
  { href: '/contacts',      icon: PhoneCall,       label: 'Contacts' },
  { href: '/export',        icon: FileDown,        label: 'Export' },
  { href: '/ai',            icon: Bot,             label: 'AI Settings' },
  { href: '/settings',      icon: Settings,        label: 'Settings' },
]

type Business = { id: string; name: string; connection_status?: string; role: string }

export function Sidebar({ user, businesses }: { user: any; businesses: Business[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const [bizOpen, setBizOpen] = useState(false)
  const [activeBiz, setActiveBiz] = useState<Business>(businesses[0] || { id: '', name: 'No Business', role: 'agent' })
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
  }

  const statusColorMap: Record<string, string> = {
    connected:    'bg-green-400',
    pending:      'bg-yellow-400',
    error:        'bg-red-400',
    disconnected: 'bg-slate-500',
  }
  const statusColor = statusColorMap[(activeBiz as any).connection_status ?? 'pending'] ?? 'bg-slate-500'

  return (
    <aside className={clsx(
      'flex flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--bg-secondary))]',
      'transition-all duration-200 shrink-0 relative',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-[rgb(var(--border))]">
        <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-green-400" />
        </div>
        {!collapsed && <span className="font-bold text-sm text-white truncate">WhatsApp CRM</span>}
      </div>

      {/* Business switcher */}
      {!collapsed && businesses.length > 0 && (
        <div className="px-2 py-2 border-b border-[rgb(var(--border))]">
          <button
            onClick={() => setBizOpen(!bizOpen)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-md bg-[rgb(var(--bg-hover))] border border-[rgb(var(--border))] flex items-center justify-center shrink-0">
              <Building2 className="w-3 h-3 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{activeBiz.name || 'Select Business'}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                <span className="text-[10px] text-slate-500 capitalize">{(activeBiz as any).connection_status ?? 'pending'}</span>
              </div>
            </div>
            <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${bizOpen ? 'rotate-180' : ''}`} />
          </button>

          {bizOpen && (
            <div className="mt-1 space-y-0.5">
              {businesses.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setActiveBiz(b); setBizOpen(false) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors text-left"
                >
                  <Check className={`w-3 h-3 shrink-0 ${activeBiz.id === b.id ? 'text-green-400' : 'opacity-0'}`} />
                  <span className="text-xs text-slate-300 truncate">{b.name}</span>
                  <span className="text-[10px] text-slate-600 ml-auto capitalize">{b.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx('nav-item', { active })}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User / Logout */}
      <div className="border-t border-[rgb(var(--border))] px-2 py-3 space-y-0.5">
        {!collapsed && (
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-white truncate">{user.email}</div>
            <div className="text-[10px] text-slate-500 capitalize">{activeBiz?.role ?? 'member'}</div>
          </div>
        )}
        <button onClick={signOut} className="nav-item w-full" title={collapsed ? 'Sign out' : undefined}>
          <LogOut className="w-4 h-4 shrink-0 text-red-400" />
          {!collapsed && <span className="text-red-400">Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-[rgb(var(--bg-card))] border border-[rgb(var(--border))] flex items-center justify-center hover:bg-[rgb(var(--bg-hover))] transition-colors z-10"
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-slate-400" />
          : <ChevronLeft className="w-3 h-3 text-slate-400" />
        }
      </button>
    </aside>
  )
}
