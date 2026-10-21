'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Building2, Users, Plus, Shield, Phone,
  CheckCircle2, AlertCircle, Clock, Trash2, Key, Globe,
  Send, Loader2, UserPlus, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export type BusinessRecord = {
  id: string
  name: string
  phone_number_id: string | null
  waba_id: string | null
  is_active: boolean
  connection_status: 'pending' | 'connected' | 'error' | 'disconnected'
  timezone: string
  supported_languages: string[]
  created_at: string
}

export type TeamMember = {
  id: string
  business_id: string
  user_id: string
  role: 'platform_admin' | 'owner' | 'manager' | 'agent'
  created_at: string
  user_email?: string
}

type Props = {
  businesses: BusinessRecord[]
  teamMembers: TeamMember[]
  userId: string
  userRole: string
}

export function SettingsClient({ businesses: initialBiz, teamMembers: initialMembers, userId, userRole }: Props) {
  const [businesses, setBusinesses] = useState<BusinessRecord[]>(initialBiz)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialMembers)
  const [selectedBizId, setSelectedBizId] = useState(businesses[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [testingSend, setTestingSend] = useState(false)
  const [testPhone, setTestPhone] = useState('')

  // New business modal
  const [showNewBizModal, setShowNewBizModal] = useState(false)
  const [newBizName, setNewBizName] = useState('')
  const [newBizPhoneId, setNewBizPhoneId] = useState('')
  const [newBizWabaId, setNewBizWabaId] = useState('')
  const [creatingBiz, setCreatingBiz] = useState(false)

  // Team invite modal
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'manager' | 'agent'>('agent')
  const [inviting, setInviting] = useState(false)

  const supabase = createClient()
  const activeBiz = businesses.find(b => b.id === selectedBizId) || businesses[0]

  const [form, setForm] = useState({
    name: activeBiz?.name || '',
    phone_number_id: activeBiz?.phone_number_id || '',
    waba_id: activeBiz?.waba_id || '',
    timezone: activeBiz?.timezone || 'Asia/Kolkata',
    is_active: activeBiz?.is_active ?? false,
    connection_status: activeBiz?.connection_status || 'pending',
  })

  function handleSelectBiz(id: string) {
    setSelectedBizId(id)
    const b = businesses.find(x => x.id === id)
    if (b) {
      setForm({
        name: b.name,
        phone_number_id: b.phone_number_id || '',
        waba_id: b.waba_id || '',
        timezone: b.timezone || 'Asia/Kolkata',
        is_active: b.is_active,
        connection_status: b.connection_status,
      })
    }
  }

  async function handleSaveBiz() {
    if (!selectedBizId) return
    setSaving(true)
    try {
      const updates: any = {
        name: form.name,
        phone_number_id: form.phone_number_id || null,
        waba_id: form.waba_id || null,
        timezone: form.timezone,
        is_active: form.is_active,
        connection_status: form.connection_status,
        updated_at: new Date().toISOString(),
      }

      const { error } = await (supabase.from('businesses') as any)
        .update(updates)
        .eq('id', selectedBizId)

      if (error) throw error

      setBusinesses(prev => prev.map(b => b.id === selectedBizId ? { ...b, ...updates } : b))
      toast.success('Business settings saved')
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault()
    if (!newBizName.trim()) return
    setCreatingBiz(true)

    try {
      const bizId = `biz_${Date.now()}`
      const newBizData: any = {
        id: bizId,
        name: newBizName.trim(),
        phone_number_id: newBizPhoneId.trim() || null,
        waba_id: newBizWabaId.trim() || null,
        is_active: true,
        connection_status: newBizPhoneId ? 'connected' : 'pending',
        timezone: 'Asia/Kolkata',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: bizErr } = await (supabase.from('businesses') as any)
        .insert(newBizData)

      if (bizErr) throw bizErr

      // Add current user as owner in business_members
      const { error: memberErr } = await (supabase.from('business_members') as any)
        .insert({
          business_id: bizId,
          user_id: userId,
          role: 'owner',
          created_at: new Date().toISOString(),
        })

      if (memberErr) throw memberErr

      setBusinesses(prev => [...prev, newBizData])
      setSelectedBizId(bizId)
      setForm({
        name: newBizData.name,
        phone_number_id: newBizData.phone_number_id || '',
        waba_id: newBizData.waba_id || '',
        timezone: newBizData.timezone,
        is_active: newBizData.is_active,
        connection_status: newBizData.connection_status,
      })

      setShowNewBizModal(false)
      setNewBizName('')
      setNewBizPhoneId('')
      setNewBizWabaId('')
      toast.success(`Client business "${newBizData.name}" created!`)
    } catch (err: any) {
      toast.error(`Creation failed: ${err.message}`)
    } finally {
      setCreatingBiz(false)
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteUserId.trim() || !selectedBizId) return
    setInviting(true)

    try {
      const payload: any = {
        business_id: selectedBizId,
        user_id: inviteUserId.trim(),
        role: inviteRole,
        created_at: new Date().toISOString(),
      }

      const { data, error } = await (supabase.from('business_members') as any)
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      setTeamMembers(prev => [...prev, data])
      setShowInviteModal(false)
      setInviteUserId('')
      toast.success('Team member added to business')
    } catch (err: any) {
      toast.error(`Member add failed: ${err.message}`)
    } finally {
      setInviting(false)
    }
  }

  const currentMembers = teamMembers.filter(m => m.business_id === selectedBizId)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-green-400" />
            Client Business & Tenant Settings
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your client businesses, WhatsApp Cloud API phone numbers, and team member permissions.
          </p>
        </div>

        <button
          onClick={() => setShowNewBizModal(true)}
          className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Client Business
        </button>
      </div>

      {/* Business selector pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[rgb(var(--border))]">
        {businesses.map(b => (
          <button
            key={b.id}
            onClick={() => handleSelectBiz(b.id)}
            className={clsx(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 shrink-0 border transition-all',
              selectedBizId === b.id
                ? 'bg-green-600/20 border-green-500/50 text-white'
                : 'bg-[rgb(var(--bg-secondary))] border-[rgb(var(--border))] text-slate-400 hover:text-slate-200'
            )}
          >
            <Building2 className="w-3.5 h-3.5" />
            {b.name}
            <span className={clsx(
              'w-2 h-2 rounded-full',
              b.connection_status === 'connected' ? 'bg-green-400' : 'bg-yellow-400'
            )} />
          </button>
        ))}
      </div>

      {activeBiz && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Business Profile & WhatsApp Phone */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-green-400" />
                  Business Profile & WhatsApp Numbers
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Status:</span>
                  <select
                    value={form.connection_status}
                    onChange={e => setForm({ ...form, connection_status: e.target.value as any })}
                    className="input text-xs py-1 px-2"
                  >
                    <option value="connected">Connected</option>
                    <option value="pending">Pending</option>
                    <option value="error">Error</option>
                    <option value="disconnected">Disconnected</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Business Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input w-full text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      Meta WhatsApp Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={form.phone_number_id}
                      onChange={e => setForm({ ...form, phone_number_id: e.target.value })}
                      placeholder="e.g. 102938475612345"
                      className="input w-full font-mono text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      From Meta App Dashboard → WhatsApp → API Setup.
                    </p>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      Meta WABA ID (WhatsApp Business Account)
                    </label>
                    <input
                      type="text"
                      value={form.waba_id}
                      onChange={e => setForm({ ...form, waba_id: e.target.value })}
                      placeholder="e.g. 987654321012345"
                      className="input w-full font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Timezone</label>
                    <select
                      value={form.timezone}
                      onChange={e => setForm({ ...form, timezone: e.target.value })}
                      className="input w-full text-xs"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                      <option value="UTC">UTC (+0:00)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-700 text-green-500 bg-slate-900 focus:ring-green-500"
                      />
                      <span className="text-xs font-medium text-slate-200">
                        Enable WhatsApp AI Automation for this business
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-[rgb(var(--border))]">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveBiz}
                  className="btn-primary text-xs px-4 py-2"
                >
                  {saving ? 'Saving...' : 'Save Business Settings'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Col: Team Members & Access */}
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Team Members
                </h2>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {currentMembers.length === 0 ? (
                  <div className="text-slate-500 text-center py-4">
                    No explicit member records found for this business.
                  </div>
                ) : (
                  currentMembers.map(m => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-lg bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border))] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-slate-300 truncate">
                          {m.user_id === userId ? 'You (Current User)' : m.user_id.slice(0, 12) + '...'}
                        </div>
                        <div className="text-[10px] text-slate-500 capitalize">Role: {m.role}</div>
                      </div>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 capitalize font-medium">
                        {m.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tenant Isolation Info Card */}
            <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-1.5 font-medium text-slate-200">
                <Shield className="w-4 h-4 text-green-400" />
                Tenant Isolation Active
              </div>
              <p className="text-[11px] leading-relaxed">
                Supabase Row Level Security (RLS) ensures that members can only query data matching their assigned <code className="font-mono text-green-300">business_id</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* New Business Modal */}
      {showNewBizModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBusiness} className="card max-w-md w-full p-6 space-y-4 border-slate-700 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-green-400" />
              Onboard New Client Business
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Client / Company Name *</label>
                <input
                  type="text"
                  required
                  value={newBizName}
                  onChange={e => setNewBizName(e.target.value)}
                  placeholder="e.g. Apex Health Clinic"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">WhatsApp Phone Number ID</label>
                <input
                  type="text"
                  value={newBizPhoneId}
                  onChange={e => setNewBizPhoneId(e.target.value)}
                  placeholder="Meta Cloud API Phone Number ID"
                  className="input w-full font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">WhatsApp Business Account ID (WABA)</label>
                <input
                  type="text"
                  value={newBizWabaId}
                  onChange={e => setNewBizWabaId(e.target.value)}
                  placeholder="WABA ID (Optional)"
                  className="input w-full font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgb(var(--border))]">
              <button
                type="button"
                onClick={() => setShowNewBizModal(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingBiz}
                className="btn-primary text-xs"
              >
                {creatingBiz ? 'Creating...' : 'Create Business'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAddMember} className="card max-w-md w-full p-6 space-y-4 border-slate-700 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" />
              Add Team Member to Business
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-medium">Supabase User UUID *</label>
                <input
                  type="text"
                  required
                  value={inviteUserId}
                  onChange={e => setInviteUserId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="input w-full font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-medium">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as any)}
                  className="input w-full"
                >
                  <option value="agent">Agent (Inbox & Leads only)</option>
                  <option value="manager">Manager (Inbox, Leads, Appointments, Export)</option>
                  <option value="owner">Owner (Full Business Control & Settings)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgb(var(--border))]">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="btn-primary text-xs"
              >
                {inviting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
