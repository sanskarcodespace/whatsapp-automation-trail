'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Search, MessageSquare, Edit2, ChevronRight, User, Phone, TrendingUp, Calendar, MapPin, DollarSign, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'

type Lead = {
  id: string | null
  business_id: string | null
  customer_phone: string | null
  customer_name: string | null
  interested_service: string | null
  preferred_bhk: string | null
  requirements: string | null
  preferred_appointment_time: string | null
  status: string | null
  budget: string | null
  location: string | null
  notes: string | null
  follow_up_date: string | null
  last_message_at: string | null
  created_at: string
}

const STAGES = ['new', 'contacted', 'interested', 'qualified', 'appointment', 'won', 'converted', 'lost', 'closed', 'follow_up_required']

const stageColor: Record<string, string> = {
  new:                 'badge-gray',
  contacted:           'badge-blue',
  interested:          'badge-blue',
  qualified:           'badge-green',
  appointment:         'badge-purple',
  won:                 'badge-green',
  converted:           'badge-green',
  lost:                'badge-red',
  closed:              'badge-gray',
  follow_up_required:  'badge-yellow',
}

export function LeadsClient({ initialLeads, businessIds, userId }: {
  initialLeads: Lead[]
  businessIds: string[]
  userId: string
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState<Partial<Lead>>({})
  const supabase = createClient()

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      (l.customer_name ?? '').toLowerCase().includes(q) ||
      (l.customer_phone ?? '').includes(q) ||
      (l.interested_service ?? '').toLowerCase().includes(q)
    const matchStage = stageFilter === 'all' || l.status === stageFilter
    return matchQ && matchStage
  })

  // Group by stage for kanban
  const kanban = STAGES.map(s => ({
    stage: s,
    leads: filtered.filter(l => l.status === s),
  }))

  async function updateLead() {
    if (!selected) return
    setSaving(true)
    const updates = {
      interested_service: editData.interested_service ?? null,
      preferred_bhk: editData.preferred_bhk ?? null,
      budget: editData.budget ?? null,
      location: editData.location ?? null,
      requirements: editData.requirements ?? null,
      follow_up_date: editData.follow_up_date || null,
      notes: editData.notes ?? null,
      status: editData.status ?? selected.status,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('customer_phone', selected.customer_phone!)
      .eq('business_id', selected.business_id!)
    if (error) toast.error('Failed to update lead')
    else {
      toast.success('Lead updated')
      setLeads(prev => prev.map(l =>
        l.customer_phone === selected.customer_phone && l.business_id === selected.business_id
          ? { ...l, ...editData } : l
      ))
      setSelected(prev => prev ? { ...prev, ...editData } : prev)
      setEditing(false)
    }
    setSaving(false)
  }

  async function updateStage(lead: Lead, newStage: string) {
    const { error } = await supabase
      .from('leads')
      .update({ status: newStage })
      .eq('customer_phone', lead.customer_phone!)
      .eq('business_id', lead.business_id!)
    if (error) toast.error('Failed to update stage')
    else setLeads(prev => prev.map(l =>
      l.customer_phone === lead.customer_phone && l.business_id === lead.business_id
        ? { ...l, status: newStage } : l
    ))
  }

  return (
    <div className="flex h-full">
      {/* Left: Kanban */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-white">Leads Pipeline</h1>
            <p className="text-xs text-slate-400 mt-0.5">{filtered.length} leads across {businessIds.length} business(es)</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="input pl-8 py-1.5 text-xs w-48"
            />
          </div>
        </div>

        {/* Stage filters */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {['all', ...STAGES].map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                stageFilter === s
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-[rgb(var(--border))]'
              )}
            >
              {s === 'all' ? `All (${leads.length})` : `${s.replace('_', ' ')} (${leads.filter(l => l.status === s).length})`}
            </button>
          ))}
        </div>

        {/* Kanban columns */}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {kanban.filter(col => col.leads.length > 0 || col.stage === 'new').map(col => (
            <div key={col.stage} className="w-56 shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={clsx('badge capitalize text-[10px]', stageColor[col.stage] ?? 'badge-gray')}>
                  {col.stage.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-600">{col.leads.length}</span>
              </div>
              <div className="space-y-2">
                {col.leads.map(lead => (
                  <button
                    key={`${lead.business_id}-${lead.customer_phone}`}
                    onClick={() => { setSelected(lead); setEditData(lead); setEditing(false) }}
                    className={clsx(
                      'w-full text-left card p-3 hover:border-green-500/30 transition-all',
                      selected?.customer_phone === lead.customer_phone ? 'border-green-500/40' : ''
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-[rgb(var(--bg-hover))] flex items-center justify-center text-xs font-bold text-slate-300">
                        {(lead.customer_name?.[0] ?? lead.customer_phone?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{lead.customer_name || lead.customer_phone}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{lead.customer_phone}</div>
                      </div>
                    </div>
                    {lead.interested_service && (
                      <div className="text-[10px] text-green-400 truncate">{lead.interested_service}</div>
                    )}
                    {lead.budget && <div className="text-[10px] text-slate-400">Budget: {lead.budget}</div>}
                    {lead.last_message_at && (
                      <div className="text-[10px] text-slate-600 mt-1">
                        {formatDistanceToNow(new Date(lead.last_message_at), { addSuffix: true })}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Lead Detail */}
      {selected && (
        <div className="w-80 shrink-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--bg-secondary))] overflow-y-auto animate-slide-in">
          <div className="p-4 border-b border-[rgb(var(--border))] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{selected.customer_name || 'Lead Details'}</h3>
            <div className="flex gap-2">
              {!editing && (
                <button onClick={() => { setEditing(true); setEditData(selected) }} className="btn-ghost text-xs py-1 px-2">
                  <Edit2 className="w-3 h-3" />Edit
                </button>
              )}
              {editing && (
                <button onClick={updateLead} disabled={saving} className="btn-primary text-xs py-1 px-2">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}Save
                </button>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Stage selector */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Stage</label>
              <select
                value={editData.status ?? selected.status ?? 'new'}
                onChange={e => {
                  const v = e.target.value
                  setEditData(prev => ({ ...prev, status: v }))
                  if (!editing) updateStage(selected, v)
                }}
                className="input text-xs mt-1"
              >
                {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>

            <Field label="Phone" value={selected.customer_phone} icon={<Phone className="w-3 h-3" />} mono />
            <Field label="Interested Service" value={editing ? undefined : selected.interested_service} icon={<TrendingUp className="w-3 h-3" />}>
              {editing && <input value={editData.interested_service ?? ''} onChange={e => setEditData(p => ({ ...p, interested_service: e.target.value }))} className="input text-xs mt-1" placeholder="Service interest…" />}
            </Field>
            <Field label="Budget" value={editing ? undefined : selected.budget} icon={<DollarSign className="w-3 h-3" />}>
              {editing && <input value={editData.budget ?? ''} onChange={e => setEditData(p => ({ ...p, budget: e.target.value }))} className="input text-xs mt-1" placeholder="Budget range…" />}
            </Field>
            <Field label="Preferred BHK" value={editing ? undefined : selected.preferred_bhk}>
              {editing && <input value={editData.preferred_bhk ?? ''} onChange={event => setEditData(previous => ({ ...previous, preferred_bhk: event.target.value }))} className="input text-xs mt-1" placeholder="e.g. 2 BHK" />}
            </Field>
            <Field label="Requested Visit Time" value={selected.preferred_appointment_time} />
            <Field label="Location" value={editing ? undefined : selected.location} icon={<MapPin className="w-3 h-3" />}>
              {editing && <input value={editData.location ?? ''} onChange={e => setEditData(p => ({ ...p, location: e.target.value }))} className="input text-xs mt-1" placeholder="Location…" />}
            </Field>
            <Field label="Requirements" value={editing ? undefined : selected.requirements}>
              {editing && <textarea value={editData.requirements ?? ''} onChange={e => setEditData(p => ({ ...p, requirements: e.target.value }))} className="input text-xs mt-1 resize-none" rows={2} placeholder="Requirements…" />}
            </Field>
            <Field label="Follow-up Date" value={editing ? undefined : selected.follow_up_date ? format(new Date(selected.follow_up_date), 'MMM d, yyyy') : null} icon={<Calendar className="w-3 h-3" />}>
              {editing && <input type="date" value={editData.follow_up_date ?? ''} onChange={e => setEditData(p => ({ ...p, follow_up_date: e.target.value }))} className="input text-xs mt-1" />}
            </Field>
            <Field label="Notes" value={editing ? undefined : selected.notes}>
              {editing && <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} className="input text-xs mt-1 resize-none" rows={3} placeholder="Internal notes…" />}
            </Field>

            <div className="pt-2">
              <Link
                href={`/inbox?session=${encodeURIComponent(selected.customer_phone ?? '')}`}
                className="btn-secondary text-xs w-full justify-center"
              >
                <MessageSquare className="w-3 h-3" />Open Conversation
              </Link>
            </div>

            <div className="text-[10px] text-slate-600 pt-2 border-t border-[rgb(var(--border))]">
              Created: {selected.created_at ? format(new Date(selected.created_at), 'MMM d, yyyy') : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, icon, mono, children }: {
  label: string; value?: string | null; icon?: React.ReactNode; mono?: boolean; children?: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
        {icon}<span>{label}</span>
      </label>
      {children ?? (
        <div className={clsx('text-xs text-slate-200', mono && 'font-mono')}>
          {value || <span className="text-slate-600">—</span>}
        </div>
      )}
    </div>
  )
}
