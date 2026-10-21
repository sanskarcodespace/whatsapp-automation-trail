import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  MessageSquare, Users, Calendar, Bot, AlertTriangle,
  TrendingUp, CheckCircle2, Clock, Send, XCircle
} from 'lucide-react'

async function getStats(supabase: any, businessIds: string[]) {
  if (!businessIds.length) return null

  const biz = businessIds

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, phone_number_id')
    .in('id', biz)
  const phoneIds = (businesses ?? []).map((b: any) => b.phone_number_id).filter(Boolean)

  const [
    { count: totalConvs },
    { count: humanConvs },
    { data: unreadData },
    { count: activeLeads },
    { count: qualifiedLeads },
    { count: appointments },
    { count: msgSent },
    { count: msgFailed },
    { count: escalations },
  ] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true })
      .in('business_id', biz),
    supabase.from('conversations').select('*', { count: 'exact', head: true })
      .in('business_id', biz).eq('human_takeover', true),
    supabase.from('conversations').select('unread_count')
      .in('business_id', biz),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .in('business_id', biz).not('status', 'in', '("won","lost")'),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .in('business_id', biz).eq('status', 'qualified'),
    supabase.from('appointment_requests').select('*', { count: 'exact', head: true })
      .in('business_id', biz).eq('status', 'pending_human_confirmation'),
    phoneIds.length > 0
      ? supabase.from('wa_messages').select('*', { count: 'exact', head: true })
          .in('phone_number_id', phoneIds).eq('direction', 'outbound').eq('status', 'sent')
      : Promise.resolve({ count: 0 }),
    phoneIds.length > 0
      ? supabase.from('wa_messages').select('*', { count: 'exact', head: true })
          .in('phone_number_id', phoneIds).eq('direction', 'outbound').eq('status', 'failed')
      : Promise.resolve({ count: 0 }),
    supabase.from('escalations').select('*', { count: 'exact', head: true })
      .in('business_id', biz).eq('status', 'open'),
  ])

  const totalUnread = (unreadData ?? []).reduce((s: number, r: any) => s + (r.unread_count ?? 0), 0)
  const aiHandled = (totalConvs ?? 0) - (humanConvs ?? 0)

  return {
    totalConvs: totalConvs ?? 0,
    humanConvs: humanConvs ?? 0,
    aiHandled,
    totalUnread,
    activeLeads: activeLeads ?? 0,
    qualifiedLeads: qualifiedLeads ?? 0,
    appointments: appointments ?? 0,
    msgSent: msgSent ?? 0,
    msgFailed: msgFailed ?? 0,
    escalations: escalations ?? 0,
  }
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)

  let businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  if (businessIds.length === 0) {
    const { data: allBiz } = await serviceClient.from('businesses').select('id')
    businessIds = (allBiz ?? []).map((b: any) => b.id)
  }

  const stats = await getStats(serviceClient, businessIds)

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 flex-col gap-3">
        <Building2 className="w-10 h-10" />
        <p className="text-sm">You&apos;re not a member of any business yet.</p>
        <p className="text-xs text-slate-600">Contact your platform administrator to get access.</p>
      </div>
    )
  }

  const cards = [
    { label: 'Total Conversations', value: stats.totalConvs, icon: MessageSquare, color: 'blue' },
    { label: 'AI Handled',          value: stats.aiHandled,   icon: Bot,           color: 'green' },
    { label: 'Needs Human',         value: stats.humanConvs,  icon: AlertTriangle, color: 'yellow' },
    { label: 'Unread Messages',     value: stats.totalUnread, icon: Clock,         color: 'purple' },
    { label: 'Active Leads',        value: stats.activeLeads, icon: TrendingUp,    color: 'blue' },
    { label: 'Qualified Leads',     value: stats.qualifiedLeads, icon: CheckCircle2, color: 'green' },
    { label: 'Pending Appointments',value: stats.appointments, icon: Calendar,     color: 'yellow' },
    { label: 'Open Escalations',    value: stats.escalations, icon: AlertTriangle, color: 'red' },
    { label: 'Messages Sent',       value: stats.msgSent,     icon: Send,          color: 'green' },
    { label: 'Send Failures',       value: stats.msgFailed,   icon: XCircle,       color: 'red' },
  ]

  const colorMap: Record<string, string> = {
    blue:   'text-blue-400 bg-blue-500/10',
    green:  'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    red:    'text-red-400 bg-red-500/10',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time statistics from your connected businesses.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/inbox" className="btn-primary">
            <MessageSquare className="w-4 h-4" /> Open Inbox
          </a>
          <a href="/leads" className="btn-secondary">
            <Users className="w-4 h-4" /> View Leads
          </a>
          <a href="/appointments" className="btn-secondary">
            <Calendar className="w-4 h-4" /> Appointments
          </a>
          {stats.escalations > 0 && (
            <a href="/inbox?filter=human" className="btn-danger">
              <AlertTriangle className="w-4 h-4" />
              {stats.escalations} need attention
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function Building2({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  )
}
