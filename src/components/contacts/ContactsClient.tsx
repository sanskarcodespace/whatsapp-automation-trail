'use client'
import { useState, useMemo } from 'react'
import {
  PhoneCall, Search, Filter, MessageSquare, Phone, User,
  Building2, ArrowUpDown, Calendar, ExternalLink
} from 'lucide-react'
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'
import clsx from 'clsx'

export type Contact = {
  customer_phone: string
  customer_name: string | null
  business_id: string | null
  business_name?: string
  last_message_at: string | null
  total_messages?: number
  lead_status: string | null
  session_id?: string | null
  human_takeover?: boolean
}

type Props = {
  contacts: Contact[]
  businesses: { id: string; name: string }[]
}

export function ContactsClient({ contacts, businesses }: Props) {
  const [search, setSearch] = useState('')
  const [selectedBiz, setSelectedBiz] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const bizMap = useMemo(() => {
    const map = new Map<string, string>()
    businesses.forEach(b => map.set(b.id, b.name))
    return map
  }, [businesses])

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (selectedBiz !== 'all' && c.business_id !== selectedBiz) return false
      if (selectedStatus !== 'all' && c.lead_status !== selectedStatus) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = c.customer_name?.toLowerCase().includes(q)
        const matchesPhone = c.customer_phone?.toLowerCase().includes(q)
        if (!matchesName && !matchesPhone) return false
      }
      return true
    })
  }, [contacts, selectedBiz, selectedStatus, search])

  function formatTime(str: string | null) {
    if (!str) return 'Never'
    try {
      const d = parseISO(str)
      if (isValid(d)) {
        return formatDistanceToNow(d, { addSuffix: true })
      }
    } catch {}
    return str
  }

  const leadBadge = (status: string | null) => {
    const map: Record<string, { label: string; cls: string }> = {
      new: { label: 'New', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
      contacted: { label: 'Contacted', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
      qualified: { label: 'Qualified', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
      won: { label: 'Won', cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
      lost: { label: 'Lost', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
    }
    const item = map[status ?? ''] || { label: status || 'Uncategorized', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }
    return (
      <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize', item.cls)}>
        {item.label}
      </span>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PhoneCall className="w-6 h-6 text-green-400" />
            Customer Contacts
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Directory of all customer numbers interacting with your WhatsApp AI automations.
          </p>
        </div>
        <div className="text-xs bg-[rgb(var(--bg-card))] border border-[rgb(var(--border))] rounded-lg px-3 py-2 text-slate-300">
          Total Contacts: <span className="font-semibold text-white">{contacts.length}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts by name or phone number..."
            className="input pl-9 w-full text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedBiz}
            onChange={e => setSelectedBiz(e.target.value)}
            className="input text-xs py-1.5 px-2.5 bg-[rgb(var(--bg-secondary))]"
          >
            <option value="all">All Businesses</option>
            {businesses.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="input text-xs py-1.5 px-2.5 bg-[rgb(var(--bg-secondary))]"
          >
            <option value="all">All Lead Stages</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
      </div>

      {/* Contacts List */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500 space-y-3">
          <User className="w-10 h-10 mx-auto opacity-40 text-slate-400" />
          <div className="text-sm font-medium text-slate-300">No contacts found</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {contacts.length === 0
              ? 'Incoming WhatsApp chats will automatically register customer phone records here.'
              : 'No contacts match your current search or filters.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[rgb(var(--bg-secondary))] text-slate-400 border-b border-[rgb(var(--border))]">
                <tr>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Phone Number</th>
                  <th className="py-3 px-4 font-medium">Business</th>
                  <th className="py-3 px-4 font-medium">Lead Stage</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium">Last Contacted</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))] text-slate-200">
                {filtered.map(contact => {
                  const bizName = contact.business_id ? (bizMap.get(contact.business_id) || contact.business_id) : '—'
                  return (
                    <tr key={`${contact.customer_phone}-${contact.business_id}`} className="hover:bg-[rgb(var(--bg-hover))] transition-colors">
                      <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-[10px]">
                          {(contact.customer_name?.[0] || 'U').toUpperCase()}
                        </div>
                        {contact.customer_name || 'Unknown Customer'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {contact.customer_phone}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded text-[11px] text-slate-300 border border-slate-700/50">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {bizName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {leadBadge(contact.lead_status)}
                      </td>
                      <td className="py-3 px-4">
                        {contact.human_takeover ? (
                          <span className="text-[11px] text-yellow-400 font-medium">Human Mode</span>
                        ) : (
                          <span className="text-[11px] text-green-400 font-medium">AI Active</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {formatTime(contact.last_message_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={`/inbox?phone=${encodeURIComponent(contact.customer_phone)}`}
                          className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
                          title="Open chat"
                        >
                          <MessageSquare className="w-3 h-3 text-green-400" />
                          Chat
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
