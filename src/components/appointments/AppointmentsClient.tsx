'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar as CalendarIcon, Clock, CheckCircle2, XCircle,
  AlertCircle, Search, Filter, MessageSquare, Phone, User,
  Building2, MoreVertical, Check, RefreshCw
} from 'lucide-react'
import { format, parseISO, isValid } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export type Appointment = {
  id: string
  business_id: string | null
  customer_phone: string | null
  customer_name: string | null
  service: string | null
  requested_time: string | null
  status: string | null
  appointment_type: string | null
  timezone: string
  confirmed_at: string | null
  notes: string | null
  created_at: string
}

type Props = {
  initialAppointments: Appointment[]
  businessIds: string[]
  businesses: { id: string; name: string }[]
  userRole: string
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending_human_confirmation', label: 'Pending Confirmation' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export function AppointmentsClient({ initialAppointments, businessIds, businesses, userRole }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedBiz, setSelectedBiz] = useState('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editTime, setEditTime] = useState('')

  const supabase = createClient()

  const bizNameMap = useMemo(() => {
    const map = new Map<string, string>()
    businesses.forEach(b => map.set(b.id, b.name))
    return map
  }, [businesses])

  const filtered = useMemo(() => {
    return appointments.filter(a => {
      if (selectedStatus !== 'all' && a.status !== selectedStatus) return false
      if (selectedBiz !== 'all' && a.business_id !== selectedBiz) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = a.customer_name?.toLowerCase().includes(q)
        const matchesPhone = a.customer_phone?.toLowerCase().includes(q)
        const matchesService = a.service?.toLowerCase().includes(q)
        if (!matchesName && !matchesPhone && !matchesService) return false
      }
      return true
    })
  }, [appointments, selectedStatus, selectedBiz, search])

  async function updateStatus(id: string, newStatus: string) {
    setUpdatingId(id)
    try {
      const updates: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }
      if (newStatus === 'confirmed') {
        updates.confirmed_at = new Date().toISOString()
      }

      const { error } = await (supabase.from('appointment_requests') as any)
        .update(updates)
        .eq('id', id)

      if (error) throw error

      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, ...updates } : a)
      )
      toast.success(`Appointment marked as ${newStatus}`)
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setUpdatingId(null)
    }
  }

  async function saveDetails() {
    if (!editingAppt) return
    setUpdatingId(editingAppt.id)
    try {
      const updates: any = {
        notes: editNotes,
        requested_time: editTime || editingAppt.requested_time,
        updated_at: new Date().toISOString(),
      }

      const { error } = await (supabase.from('appointment_requests') as any)
        .update(updates)
        .eq('id', editingAppt.id)

      if (error) throw error

      setAppointments(prev =>
        prev.map(a => a.id === editingAppt.id ? { ...a, ...updates } : a)
      )
      toast.success('Appointment details updated')
      setEditingAppt(null)
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setUpdatingId(null)
    }
  }

  function formatTime(str: string | null) {
    if (!str) return 'Not specified'
    try {
      const d = parseISO(str)
      if (isValid(d)) {
        return format(d, 'MMM d, yyyy · h:mm a')
      }
    } catch {}
    return str
  }

  const statusBadge = (status: string | null) => {
    switch (status) {
      case 'confirmed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/15 text-green-400 border border-green-500/30"><CheckCircle2 className="w-3 h-3" /> Confirmed</span>
      case 'pending_human_confirmation':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"><Clock className="w-3 h-3" /> Needs Confirmation</span>
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30"><Check className="w-3 h-3" /> Completed</span>
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30"><XCircle className="w-3 h-3" /> Cancelled</span>
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">{status || 'Unknown'}</span>
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-green-400" />
            Appointments
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage customer appointment booking requests captured via WhatsApp AI automation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs bg-[rgb(var(--bg-card))] border border-[rgb(var(--border))] rounded-lg px-3 py-2 text-slate-300">
            Total: <span className="font-semibold text-white">{appointments.length}</span>
          </div>
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
            placeholder="Search by customer name, phone, or service..."
            className="input pl-9 w-full text-xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
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

          <div className="flex gap-1 bg-[rgb(var(--bg-secondary))] p-1 rounded-lg border border-[rgb(var(--border))] shrink-0">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedStatus(f.id)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
                  selectedStatus === f.id
                    ? 'bg-green-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Appointment Table / Cards */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500 space-y-3">
          <CalendarIcon className="w-10 h-10 mx-auto opacity-40 text-slate-400" />
          <div className="text-sm font-medium text-slate-300">No appointments found</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {appointments.length === 0
              ? 'Incoming appointment requests detected by the WhatsApp AI bot will automatically populate here.'
              : 'No appointments match your active filter and search criteria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(appt => {
            const isUpdating = updatingId === appt.id
            const bizName = appt.business_id ? (bizNameMap.get(appt.business_id) || appt.business_id) : '—'
            return (
              <div
                key={appt.id}
                className="card p-4 transition-all hover:border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left column: Customer & Service info */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      {appt.customer_name || 'Unknown Customer'}
                    </span>
                    <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-500" />
                      {appt.customer_phone || '—'}
                    </span>
                    <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700/50 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {bizName}
                    </span>
                    {statusBadge(appt.status)}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500">Service: </span>
                      <span className="font-medium text-slate-200">{appt.service || 'General Inquiry'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-slate-500">Requested Time: </span>
                      <span className="font-medium text-slate-200">{formatTime(appt.requested_time)}</span>
                    </div>
                  </div>

                  {appt.notes && (
                    <div className="text-xs text-slate-400 italic bg-slate-900/60 p-2 rounded border border-slate-800/80 mt-1">
                      Note: {appt.notes}
                    </div>
                  )}
                </div>

                {/* Right column: Action buttons */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {appt.customer_phone && (
                    <a
                      href={`/inbox?phone=${encodeURIComponent(appt.customer_phone)}`}
                      className="btn-secondary text-xs px-2.5 py-1.5"
                      title="Open conversation in WhatsApp Inbox"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                      Chat
                    </a>
                  )}

                  <button
                    onClick={() => {
                      setEditingAppt(appt)
                      setEditNotes(appt.notes || '')
                      setEditTime(appt.requested_time || '')
                    }}
                    className="btn-secondary text-xs px-2.5 py-1.5"
                  >
                    Edit / Reschedule
                  </button>

                  {appt.status !== 'confirmed' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => updateStatus(appt.id, 'confirmed')}
                      className="btn-primary text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-500"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm
                    </button>
                  )}

                  {appt.status === 'confirmed' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => updateStatus(appt.id, 'completed')}
                      className="btn-secondary text-xs px-2.5 py-1.5 text-blue-400 hover:text-blue-300"
                    >
                      Mark Completed
                    </button>
                  )}

                  {appt.status !== 'cancelled' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => updateStatus(appt.id, 'cancelled')}
                      className="btn-secondary text-xs px-2.5 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit / Reschedule Modal */}
      {editingAppt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border-slate-700 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-green-400" />
              Edit Appointment
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Customer</label>
                <div className="text-white font-medium">{editingAppt.customer_name || 'Unknown'} ({editingAppt.customer_phone})</div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Requested Time (Date & Time or natural text)</label>
                <input
                  type="text"
                  value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  placeholder="e.g. 2026-10-25 15:00 or Tomorrow at 4 PM"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Internal Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Add notes for staff or appointment instructions..."
                  className="input w-full resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[rgb(var(--border))]">
              <button
                type="button"
                onClick={() => setEditingAppt(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingId === editingAppt.id}
                onClick={saveDetails}
                className="btn-primary text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
