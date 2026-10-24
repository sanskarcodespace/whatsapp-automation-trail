'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Plus, Users, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

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
}

type Props = {
  businesses: BusinessRecord[]
  teamMembers: TeamMember[]
  userId: string
  canProvision: boolean
}

const emptyClient = { name: '', phone_number_id: '', waba_id: '', timezone: 'Asia/Kolkata', owner_phone: '' }

function ClientPanel({ business, members, userId, onSaved }: { business: BusinessRecord; members: TeamMember[]; userId: string; onSaved: (business: BusinessRecord) => void }) {
  const router = useRouter()
  const [name, setName] = useState(business.name)
  const [timezone, setTimezone] = useState(business.timezone || 'Asia/Kolkata')
  const [phoneId, setPhoneId] = useState(business.phone_number_id ?? '')
  const [wabaId, setWabaId] = useState(business.waba_id ?? '')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('agent')
  const [busy, setBusy] = useState(false)
  const memberRole = members.find(member => member.user_id === userId)?.role
  const canManage = ['platform_admin', 'owner', 'manager'].includes(memberRole ?? '')
  const canManageMembers = ['platform_admin', 'owner'].includes(memberRole ?? '')
  const canCorrectIdentity = memberRole === 'platform_admin' && !business.is_active && business.connection_status !== 'connected'

  async function mutate(method: string, payload: Record<string, unknown>) {
    setBusy(true)
    try {
      const response = await fetch('/api/business/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save')
      if (method === 'PATCH') onSaved(result.result)
      toast.success(method === 'PATCH' ? 'Client updated' : 'Team access updated')
      setEmail('')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save')
    } finally {
      setBusy(false)
    }
  }

  async function verifyConnection() {
    setBusy(true)
    try {
      const response = await fetch('/api/business/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Verification failed')
      onSaved({ ...business, connection_status: 'connected' })
      toast.success('Meta access and app subscription verified. Send a test chat before customer rollout.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to verify connection')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-white">{business.name}</h2>
          <span className="text-xs text-slate-300">{business.is_active ? 'Automation active' : 'Automation paused'} · Connection: {business.connection_status}</span>
        </div>
        <fieldset disabled={busy || !canManage} className="space-y-4 disabled:opacity-60">
          <label className="block text-xs text-slate-300 space-y-1">Business name
            <input className="input w-full" value={name} maxLength={160} onChange={event => setName(event.target.value)} />
          </label>
          <label className="block text-xs text-slate-300 space-y-1">Timezone (IANA)
            <input className="input w-full" value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="Asia/Kolkata" />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-xs text-slate-300 space-y-1">Meta phone number ID
              <input className="input w-full font-mono" readOnly={!canCorrectIdentity} value={phoneId} onChange={event => setPhoneId(event.target.value)} />
            </label>
            <label className="text-xs text-slate-300 space-y-1">WhatsApp Business Account ID
              <input className="input w-full font-mono" readOnly={!canCorrectIdentity} value={wabaId} onChange={event => setWabaId(event.target.value)} />
            </label>
          </div>
          <p className="text-xs text-slate-500">Phone identity is locked once used. Only the operator can correct an unused, paused client.</p>
          <button type="button" className="btn-primary" onClick={() => mutate('PATCH', { name, timezone, ...(phoneId !== business.phone_number_id && canCorrectIdentity ? { phone_number_id: phoneId } : {}), ...(wabaId !== business.waba_id && canCorrectIdentity ? { waba_id: wabaId } : {}) })}>Save profile</button>
        </fieldset>
        <div className="border-t border-slate-700 pt-4 space-y-3">
          <h3 className="text-sm font-medium text-white">WhatsApp onboarding</h3>
          <ol className="list-decimal pl-4 text-xs text-slate-400 space-y-2">
            <li>Authorize this client’s number and WABA with the shared Meta app used by your n8n credential. This CRM does not bypass Meta approval.</li>
            <li>Verify the connection here, then enable automation. Verification checks access and app subscription; it does not send messages.</li>
            <li>Send a test message from WhatsApp and confirm the correct client’s reply and inbox before going live.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="text-xs border border-slate-600 rounded-lg p-2 text-slate-200 disabled:opacity-40" disabled={!canManage || busy} onClick={verifyConnection}>Verify WhatsApp connection</button>
            <button type="button" className="text-xs border border-slate-600 rounded-lg p-2 text-slate-200 disabled:opacity-40" disabled={!canManage || busy || (!business.is_active && business.connection_status !== 'connected')} onClick={() => {
              if (window.confirm(`${business.is_active ? 'Pause' : 'Enable'} automatic replies for ${business.name}? Existing human-takeover chats will stay paused.${business.connection_status !== 'connected' ? ' Re-enabling will require WhatsApp connection verification.' : ''}`)) mutate('PATCH', { is_active: !business.is_active })
            }}>{business.is_active ? 'Pause automation' : 'Enable automation'}</button>
            <Link href={`/ai?business=${encodeURIComponent(business.id)}`} className="text-xs text-green-300 p-2">Edit catalog & bot behavior →</Link>
          </div>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2"><Users size={18} /> Client team</h2>
        <p className="text-xs text-slate-400">Owners manage access; managers edit client settings; agents handle conversations. Assign only people authorized to see this client’s data.</p>
        {members.map(member => <div key={member.id} className="border border-slate-700 rounded-lg p-3 space-y-1">
          <p className="text-xs text-slate-200 break-all">{member.user_id === userId ? 'You' : member.user_id}</p>
          <p className="text-xs text-slate-400 capitalize">{member.role.replaceAll('_', ' ')}</p>
          {canManageMembers && member.user_id !== userId && member.role !== 'platform_admin' && <button type="button" disabled={busy} className="text-xs text-red-300" onClick={() => {
            if (window.confirm('Remove this person’s access to this client?')) mutate('DELETE', { user_id: member.user_id })
          }}>Remove access</button>}
        </div>)}
        {canManageMembers && <fieldset disabled={busy} className="space-y-3 border-t border-slate-700 pt-4">
          <h3 className="text-sm text-white">Assign / change role</h3>
          <label className="block text-xs text-slate-300 space-y-1">Verified CRM account email
            <input type="email" className="input w-full" value={email} onChange={event => setEmail(event.target.value)} placeholder="client@example.com" />
          </label>
          <label className="block text-xs text-slate-300 space-y-1">Client role
            <select className="input w-full" value={role} onChange={event => setRole(event.target.value)}>
              <option value="agent">Agent</option><option value="manager">Manager</option><option value="owner">Owner</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">Ask new members to open this CRM’s <Link href="/signup" className="text-green-300">/signup</Link> page and verify their email first. This action does not send an invitation.</p>
          <button type="button" disabled={!email.trim()} className="btn-primary w-full" onClick={() => {
            if (window.confirm(`Grant ${email.trim()} ${role} access to ${business.name}? This includes access to client conversations and leads.`)) mutate('PUT', { email: email.trim(), role })
          }}>Assign to client</button>
        </fieldset>}
      </section>
    </div>
  )
}

export function SettingsClient({ businesses, teamMembers, userId, canProvision }: Props) {
  const router = useRouter()
  const [clientList, setClientList] = useState(businesses)
  const [selectedId, setSelectedId] = useState(businesses[0]?.id ?? '')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState(emptyClient)
  const [creating, setCreating] = useState(false)
  const selected = clientList.find(business => business.id === selectedId)

  async function createClient() {
    setCreating(true)
    try {
      const response = await fetch('/api/business/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to create client')
      setClientList(previous => [...previous, result.result])
      setSelectedId(result.result.id)
      setShowCreate(false)
      setDraft(emptyClient)
      toast.success('Client created, paused until WhatsApp onboarding is verified')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create client')
    } finally {
      setCreating(false)
    }
  }

  return <div className="p-6 max-w-6xl mx-auto space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Building2 className="text-green-400" /> Client management</h1>
        <p className="text-sm text-slate-400 mt-1">One workspace for client businesses, team access and automation controls.</p></div>
      {canProvision && <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(!showCreate)}><Plus size={16} /> New client</button>}
    </div>
    {showCreate && <section className="card p-6 space-y-4">
      <h2 className="font-semibold text-white">Create client business</h2>
      <p className="text-xs text-slate-400">A new client has an empty catalog and starts paused. No WhatsApp messages are sent and no other accounts receive access.</p>
      <fieldset disabled={creating} className="grid sm:grid-cols-2 gap-4">
        {([['name', 'Business name'], ['phone_number_id', 'Meta phone number ID'], ['waba_id', 'WhatsApp Business Account ID'], ['timezone', 'Timezone (IANA)'], ['owner_phone', 'Owner alert number (country code + digits, optional)']] as const).map(([key, label]) => <label key={key} className="text-xs text-slate-300 space-y-1">
          <span className="block">{label}</span><input className="input w-full" value={draft[key]} maxLength={160} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
        </label>)}
      </fieldset>
      <button type="button" disabled={creating} className="btn-primary" onClick={createClient}>{creating ? 'Creating…' : 'Create paused client'}</button>
    </section>}
    {clientList.length ? <>
      <label className="block text-xs text-slate-300 space-y-1">Selected client
        <select className="input w-full" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          {clientList.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
        </select>
      </label>
      {selected && <ClientPanel key={selected.id} business={selected} userId={userId} members={teamMembers.filter(member => member.business_id === selected.id)} onSaved={updated => setClientList(previous => previous.map(business => business.id === updated.id ? updated : business))} />}
    </> : <p className="card p-6 text-sm text-slate-400">No clients assigned. Only a platform operator can create a client; unassigned accounts cannot give themselves access.</p>}
    <p className="text-xs text-slate-500 flex items-center gap-2"><ShieldCheck size={16} /> Every client action is checked on the server. Being an operator does not grant access to unrelated clients.</p>
  </div>
}
