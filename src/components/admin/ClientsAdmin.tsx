'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Plus, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { INDUSTRIES, type Industry } from '@/lib/business-access'

type Client = { id: string; name: string; industry: Industry; access_status: 'active' | 'suspended'; is_active: boolean; connection_status: string; phone_number_id: string | null; waba_id: string | null; timezone: string }
type Invitation = { id: string; business_id: string; email: string; role: string; status: string; expires_at: string }
type Props = { businesses: Client[]; invitations: Invitation[]; selectedBusiness?: string }

async function api(path: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Unable to save')
  return result
}

function ClientSetup({ client, invitations, onSaved }: { client: Client; invitations: Invitation[]; onSaved: (client: Client) => void }) {
  const router = useRouter()
  const [tab, setTab] = useState('setup')
  const [profile, setProfile] = useState({ name: client.name, industry: client.industry, timezone: client.timezone })
  const [connection, setConnection] = useState({ phone_number_id: client.phone_number_id || '', waba_id: client.waba_id || '' })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('owner')
  const [busy, setBusy] = useState(false)
  async function perform(action: () => Promise<void>) {
    setBusy(true)
    try { await action(); router.refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update client') }
    finally { setBusy(false) }
  }
  async function update(payload: Record<string, unknown>) {
    const result = await api('/api/business/clients', 'PATCH', { business_id: client.id, ...payload })
    onSaved(result.result)
    toast.success('Client updated')
  }
  return <section className="card p-5 space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{client.name}</h2><p className="text-xs text-slate-400">{client.access_status === 'suspended' ? 'Access suspended · automation stopped' : 'Access allowed'} · {client.is_active ? 'Automation on' : 'Automation off'}</p></div><Link href={`/inbox?business=${client.id}`} className="text-sm text-green-300">Open client workspace →</Link></header>
    <div className="flex gap-2 flex-wrap">{['setup', 'access', 'whatsapp'].map(section => <button type="button" key={section} className={section === tab ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(section)}>{section === 'setup' ? '1. Business setup' : section === 'access' ? '2. Client access' : '3. Connect & enable'}</button>)}</div>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      {tab === 'setup' && <>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-slate-300">Business name<input className="input w-full mt-1" value={profile.name} maxLength={160} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label><label className="text-xs text-slate-300">Business type<select className="input w-full mt-1" value={profile.industry} onChange={event => setProfile({ ...profile, industry: event.target.value as Industry })}>{Object.entries(INDUSTRIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <details className="text-xs text-slate-400"><summary>Timezone (optional)</summary><input aria-label="Timezone" className="input mt-2" value={profile.timezone} onChange={event => setProfile({ ...profile, timezone: event.target.value })} /></details>
        <button className="btn-secondary" onClick={() => perform(() => update(profile))}>Save business profile</button>
        <div className="rounded-xl border border-green-800 p-4 space-y-2"><h3 className="text-sm font-medium">Prepare this client’s assistant</h3><p className="text-xs text-slate-400">Add business basics, then optional offerings and prices. Other clients’ content is never copied. Changing business type does not erase saved data.</p><Link href={`/ai?business=${client.id}`} className="inline-block text-green-300 text-sm">Open simple AI setup →</Link></div>
      </>}
      {tab === 'access' && <>
        <p className="text-sm text-slate-400">Approve the client’s email. They create their own password and verify their email at <strong>/signup</strong>. Existing verified accounts gain access immediately. No email invitation is sent automatically.</p>
        <form className="grid sm:grid-cols-3 gap-3" onSubmit={event => { event.preventDefault(); if (window.confirm(`Allow ${email.trim()} to access conversations and leads for ${client.name} as ${role}?`)) perform(async () => { await api('/api/business/clients', 'PUT', { business_id: client.id, email: email.trim(), role }); setEmail(''); toast.success('Email approved. Share your CRM signup address with the client.') }) }}>
          <label className="text-xs text-slate-300">Client email<input type="email" required className="input w-full mt-1" value={email} onChange={event => setEmail(event.target.value)} /></label><label className="text-xs text-slate-300">Workspace role<select className="input w-full mt-1" value={role} onChange={event => setRole(event.target.value)}><option value="owner">Client owner</option><option value="manager">Client manager</option><option value="agent">Inbox agent</option></select></label><button type="submit" className="btn-primary self-end">Approve email</button>
        </form>
        <p className="text-xs text-slate-500">Client roles never grant platform-admin access, permission to add businesses, or permission to resume a suspended subscription.</p>
        {invitations.map(invitation => <div key={invitation.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-700 p-3"><div><p className="text-sm break-all">{invitation.email}</p><p className="text-xs text-slate-400">{invitation.role} · {invitation.status === 'pending' && new Date(invitation.expires_at) < new Date() ? 'Expired — approve again' : invitation.status}</p></div>{invitation.status !== 'revoked' && <button type="button" className="text-xs text-red-300" onClick={() => { if (window.confirm(`Revoke ${invitation.email}'s access to ${client.name}?`)) perform(async () => { await api('/api/business/invitations', 'DELETE', { business_id: client.id, email: invitation.email }); toast.success('Access revoked') }) }}>Revoke access</button>}</div>)}
        <button type="button" className={client.access_status === 'suspended' ? 'btn-primary' : 'btn-danger'} onClick={() => { if (window.confirm(client.access_status === 'suspended' ? `Restore ${client.name}'s CRM access? Automation remains off until separately enabled.` : `Suspend ${client.name}? Client accounts will lose workspace access and automatic replies will stop. History is retained.`)) perform(() => update({ access_status: client.access_status === 'suspended' ? 'active' : 'suspended' })) }}>{client.access_status === 'suspended' ? 'Restore client access' : 'Suspend client service'}</button>
      </>}
      {tab === 'whatsapp' && <>
        <p className="text-sm text-slate-400">Administrator-only, one-time setup. Connect the client’s number to the shared Meta app used by n8n, then verify it here. Creating a CRM account does not authorize a WhatsApp number.</p>
        <div className="grid sm:grid-cols-2 gap-3">{(['phone_number_id', 'waba_id'] as const).map(key => <label key={key} className="text-xs text-slate-300">{key === 'phone_number_id' ? 'Meta phone number ID' : 'WhatsApp Business Account ID'}<input className="input w-full mt-1" readOnly={client.is_active || client.connection_status === 'connected'} value={connection[key]} onChange={event => setConnection({ ...connection, [key]: event.target.value })} /></label>)}</div>
        <p className="text-xs text-slate-500">Used sender identities are locked on the server. Never paste API tokens into these fields.</p>
        <div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={() => perform(() => update(connection))}>Save connection IDs</button><button type="button" className="btn-secondary" onClick={() => perform(async () => { await api('/api/business/connection', 'POST', { business_id: client.id }); onSaved({ ...client, connection_status: 'connected' }); toast.success('Connection verified. Test replies before customer rollout.') })}>Verify connection</button></div>
        <p className="text-xs text-slate-400">Connection: {client.connection_status}. Enabling requires a verified connection and allowed client access.</p>
        <button type="button" className="btn-primary" disabled={client.access_status === 'suspended' || (!client.is_active && client.connection_status !== 'connected')} onClick={() => { if (window.confirm(`${client.is_active ? 'Pause' : 'Enable'} automatic replies for ${client.name}? Per-chat human takeover remains unchanged.${client.connection_status !== 'connected' ? ' Re-enabling will require verified WhatsApp setup.' : ''}`)) perform(() => update({ is_active: !client.is_active })) }}>{client.is_active ? 'Pause automation' : 'Enable automation'}</button>
      </>}
    </fieldset>
  </section>
}

export function ClientsAdmin({ businesses, invitations, selectedBusiness }: Props) {
  const router = useRouter()
  const [clients, setClients] = useState(businesses)
  const [selectedId, setSelectedId] = useState(selectedBusiness ?? businesses[0]?.id ?? '')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', industry: 'general' as Industry })
  const [busy, setBusy] = useState(false)
  const selected = clients.find(client => client.id === selectedId)
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!window.confirm(`Create ${draft.name} and approve ${draft.email} as its client owner? This grants access to this client's data after email verification. Automation starts off.`)) return
    setBusy(true)
    try {
      const result = await api('/api/business/clients', 'POST', draft)
      setClients(previous => [...previous, result.result]); setSelectedId(result.result.id); setShowCreate(false)
      setDraft({ name: '', email: '', industry: 'general' }); toast.success('Client created. Complete AI setup and WhatsApp connection, then enable.')
      router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create client') }
    finally { setBusy(false) }
  }
  return <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
    <header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-2xl font-bold flex gap-2 items-center"><ShieldCheck className="text-green-400" /> Admin · All clients</h1><p className="text-sm text-slate-400 mt-1">You set up each business, approve its users and control how long they can use the service.</p></div><button className="btn-primary" onClick={() => setShowCreate(!showCreate)}><Plus size={16} /> Add client</button></header>
    {showCreate && <form onSubmit={create} className="card p-5 space-y-4"><h2 className="font-semibold">Start with three details</h2><p className="text-xs text-slate-400">No client password needed. You can connect WhatsApp after creating the workspace.</p><fieldset disabled={busy} className="grid sm:grid-cols-3 gap-3"><label className="text-xs text-slate-300">Business name<input required className="input w-full mt-1" maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label className="text-xs text-slate-300">Client email<input required type="email" className="input w-full mt-1" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label><label className="text-xs text-slate-300">Business type<select className="input w-full mt-1" value={draft.industry} onChange={event => setDraft({ ...draft, industry: event.target.value as Industry })}>{Object.entries(INDUSTRIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></fieldset><button type="submit" disabled={busy} className="btn-primary">{busy ? 'Creating…' : 'Create client & approve email'}</button></form>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{clients.map(client => <button key={client.id} type="button" className={`card p-4 text-left ${selectedId === client.id ? 'ring-1 ring-green-500' : ''}`} onClick={() => setSelectedId(client.id)}><Building2 size={18} className="text-green-400 mb-2" /><strong className="block">{client.name}</strong><span className="text-xs text-slate-400">{INDUSTRIES[client.industry]} · {client.access_status === 'suspended' ? 'Suspended' : client.is_active ? 'Live' : 'Setup / paused'}</span></button>)}</div>
    {selected && <ClientSetup key={selected.id} client={selected} invitations={invitations.filter(invitation => invitation.business_id === selected.id)} onSaved={updated => setClients(previous => previous.map(client => client.id === updated.id ? updated : client))} />}
    <p className="text-xs text-slate-500">Client accounts only see assigned, allowed workspaces. Use a hosted HTTPS CRM address for clients on other computers; localhost is only your local preview.</p>
  </div>
}
