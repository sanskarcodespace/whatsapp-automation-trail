'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bot, Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { AI_SETTING_KEYS, type AISettings, type BusinessCatalog, type CatalogProject } from '@/lib/business-access'

type BusinessData = {
  id: string
  name: string
  system_prompt: string | null
  settings?: AISettings
} & Partial<Record<typeof AI_SETTING_KEYS[number], string | null>>

type StyleProfile = {
  business_id: string
  approved: boolean
  style_notes: string | null
  example_customer: string | null
  example_reply: string | null
}

type Props = {
  businesses: BusinessData[]
  initialStyleProfiles: StyleProfile[]
  manageableBusinessIds: string[]
}

const textFields = [
  ['ai_tone', 'Tone', 'Warm, professional and concise'],
  ['services', 'Services', 'Services offered by this client'],
  ['products', 'Products', 'Products offered by this client'],
  ['prices', 'General pricing notes', 'Fees or pricing policies. Edit project prices in the catalog below.'],
  ['faqs', 'FAQs', 'Questions and verified answers'],
  ['opening_hours', 'Opening hours', 'Days, hours and holiday exceptions'],
  ['contact_details', 'Public contact details', 'Customer-facing phone, email and address'],
  ['booking_system', 'Visit / appointment policy', 'How your team handles requests; the bot never confirms bookings'],
  ['greeting_en', 'English greeting', 'Hello! How are you?'],
  ['greeting_hi', 'Hindi / Hinglish greeting', 'Namaste! Kaise hain aap?'],
  ['handoff_message', 'English human-request acknowledgement', 'Your request is noted. Our team will contact you.'],
  ['handoff_message_hi', 'Hindi / Hinglish human-request acknowledgement', 'Aapki request note kar li hai. Team aapse sampark karegi.'],
  ['owner_phone', 'Owner alert number (country code + digits)', '919876543210'],
] as const

function formFor(business?: BusinessData, style?: StyleProfile) {
  const settings = Object.fromEntries(AI_SETTING_KEYS.map(key => [key, business?.settings?.[key] ?? business?.[key] ?? ''])) as Record<typeof AI_SETTING_KEYS[number], string>
  return {
    ...settings,
    system_prompt: business?.system_prompt ?? '',
    style_notes: style?.style_notes ?? '',
    example_customer: style?.example_customer ?? '',
    example_reply: style?.example_reply ?? '',
  }
}

function ProjectEditor({ project, onChange, onRemove }: { project: CatalogProject; onChange: (project: CatalogProject) => void; onRemove: () => void }) {
  return (
    <div className="border border-slate-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-medium text-white">{project.name || 'New project'}</h3>
        <button type="button" onClick={onRemove} className="text-red-300 text-xs flex items-center gap-1"><Trash2 size={14} /> Remove project</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {(['name', 'location', 'category', 'status', 'price'] as const).map(key => (
          <label key={key} className="text-xs text-slate-300 space-y-1">
            <span className="block capitalize">{key === 'price' ? 'General price (plots / commercial)' : key}</span>
            <input className="input w-full" value={project[key] ?? ''} maxLength={4000} onChange={event => onChange({ ...project, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      <label className="block text-xs text-slate-300 space-y-1">Description
        <textarea className="input w-full" rows={2} value={project.description ?? ''} maxLength={4000} onChange={event => onChange({ ...project, description: event.target.value })} />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        {(['aliases', 'amenities'] as const).map(key => (
          <label key={key} className="text-xs text-slate-300 space-y-1">
            <span className="block capitalize">{key} (one per line)</span>
            <textarea className="input w-full" rows={3} value={(project[key] ?? []).join('\n')} onChange={event => onChange({ ...project, [key]: event.target.value.split('\n') })} />
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-slate-300">BHK configurations & indicative prices</p>
        {(project.configurations ?? []).map((configuration, index) => (
          <div key={index} className="flex items-center gap-2">
            <input aria-label="BHK count" type="number" min={1} max={9} className="input w-20" value={configuration.bhk} onChange={event => onChange({ ...project, configurations: project.configurations?.map((entry, position) => position === index ? { ...entry, bhk: Number(event.target.value) } : entry) })} />
            <span className="text-xs text-slate-400">BHK</span>
            <input aria-label="Indicative price" className="input flex-1 min-w-0" value={configuration.price} maxLength={300} placeholder="e.g. ₹62–65 lakh" onChange={event => onChange({ ...project, configurations: project.configurations?.map((entry, position) => position === index ? { ...entry, price: event.target.value } : entry) })} />
            <button type="button" aria-label="Remove configuration" className="text-red-300" onClick={() => onChange({ ...project, configurations: project.configurations?.filter((_, position) => position !== index) })}><Trash2 size={16} /></button>
          </div>
        ))}
        <button type="button" className="text-green-300 text-xs" disabled={(project.configurations?.length ?? 0) >= 20} onClick={() => onChange({ ...project, configurations: [...(project.configurations ?? []), { bhk: 2, price: '' }] })}>+ Add configuration</button>
      </div>
    </div>
  )
}

export function AISettingsClient({ businesses, initialStyleProfiles, manageableBusinessIds }: Props) {
  const [bizList, setBizList] = useState(businesses)
  const [styles, setStyles] = useState(initialStyleProfiles)
  const [selectedBizId, setSelectedBizId] = useState(businesses[0]?.id ?? '')
  const [form, setForm] = useState(() => formFor(businesses[0], initialStyleProfiles.find(profile => profile.business_id === businesses[0]?.id)))
  const [catalog, setCatalog] = useState<BusinessCatalog>(businesses[0]?.settings?.catalog ?? { projects: [] })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const canManage = manageableBusinessIds.includes(selectedBizId)
  const activeBusiness = bizList.find(business => business.id === selectedBizId)

  function selectBusiness(businessId: string) {
    if (dirty && !window.confirm('Discard unsaved changes for this client?')) return
    const business = bizList.find(entry => entry.id === businessId)
    setSelectedBizId(businessId)
    setForm(formFor(business, styles.find(profile => profile.business_id === businessId)))
    setCatalog(business?.settings?.catalog ?? { projects: [] })
    setDirty(false)
  }

  function changeCatalog(next: BusinessCatalog) {
    setCatalog(next)
    setDirty(true)
  }

  async function save() {
    if (!canManage || saving) return
    setSaving(true)
    const businessId = selectedBizId
    const settings: AISettings = { ...Object.fromEntries(AI_SETTING_KEYS.map(key => [key, form[key]])), catalog }
    const style = { style_notes: form.style_notes, example_customer: form.example_customer, example_reply: form.example_reply }
    try {
      const response = await fetch('/api/business/ai-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, system_prompt: form.system_prompt, settings, style }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Save failed')
      setBizList(previous => previous.map(business => business.id === businessId ? { ...business, settings: result.settings, system_prompt: form.system_prompt } : business))
      setStyles(previous => [...previous.filter(profile => profile.business_id !== businessId), { business_id: businessId, approved: true, ...style }])
      setDirty(false)
      toast.success('Client configuration saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Bot className="text-green-400" /> Client AI Configuration</h1>
          <p className="text-sm text-slate-400 mt-1">Business knowledge, prices and response preferences — separately for each client.</p>
        </div>
        <Link href="/settings" className="text-sm text-green-300">Manage clients & team →</Link>
      </div>
      {!activeBusiness ? <p className="card p-6 text-slate-400">No clients are assigned to your account. Ask your platform operator for access.</p> : <>
        <label className="block text-xs text-slate-300 space-y-2">Editing client
          <select className="input w-full" value={selectedBizId} disabled={saving} onChange={event => selectBusiness(event.target.value)}>
            {bizList.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
        </label>
        <div className="rounded-xl border border-slate-700 p-4 text-xs text-slate-400 space-y-2">
          <p>The CRM-controlled workflow loads saved settings for each new turn. A turn already in progress or being retried keeps its existing snapshot.</p>
          <p>Guardrails always remain: no automatic visit confirmation, no unsolicited visit pitches, strict BHK filters and no replies during human takeover.</p>
          {!canManage && <p className="text-amber-300">Read-only access. An owner or manager can edit this client.</p>}
        </div>
        <fieldset disabled={!canManage || saving} className="space-y-6 disabled:opacity-70">
          <section className="card p-6 space-y-4">
            <h2 className="font-semibold text-white">Business knowledge & conversation</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {textFields.map(([key, label, placeholder]) => <label key={key} className="text-xs text-slate-300 space-y-1">
                <span className="block">{label}</span>
                <textarea rows={key === 'faqs' || key === 'services' ? 4 : 2} className="input w-full" value={form[key]} maxLength={30000} placeholder={placeholder} onChange={event => { setForm({ ...form, [key]: event.target.value }); setDirty(true) }} />
              </label>)}
            </div>
            <p className="text-xs text-amber-200">Owner WhatsApp alerts may fail outside the owner’s 24-hour reply window until an approved template is configured. Requests are still saved in the CRM.</p>
          </section>
          <section className="card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Project catalog ({catalog.projects.length})</h2>
              <button type="button" disabled={catalog.projects.length >= 100} className="text-green-300 text-xs flex items-center gap-1" onClick={() => changeCatalog({ ...catalog, projects: [...catalog.projects, { id: `project_${crypto.randomUUID().replaceAll('-', '')}`, name: '', configurations: [], amenities: [], aliases: [] }] })}><Plus size={16} /> Add project</button>
            </div>
            <p className="text-xs text-slate-400">This is the source of truth for project prices, BHK options and amenities. An empty catalog stays empty; no other client’s catalog is substituted.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {(['profile', 'head_office', 'sales_office', 'phone', 'email', 'hours'] as const).map(key => <label key={key} className="text-xs text-slate-300 space-y-1">
                <span className="block capitalize">{key.replaceAll('_', ' ')}</span>
                <textarea rows={2} className="input w-full" value={catalog[key] ?? ''} maxLength={10000} onChange={event => changeCatalog({ ...catalog, [key]: event.target.value })} />
              </label>)}
            </div>
            {catalog.projects.map(project => <ProjectEditor key={project.id} project={project}
              onChange={updated => changeCatalog({ ...catalog, projects: catalog.projects.map(entry => entry.id === project.id ? updated : entry) })}
              onRemove={() => { if (window.confirm(`Remove ${project.name || 'this project'} from this client's catalog? Save to apply.`)) changeCatalog({ ...catalog, projects: catalog.projects.filter(entry => entry.id !== project.id) }) }} />)}
          </section>
          <section className="card p-6 space-y-4">
            <h2 className="font-semibold text-white">Response preferences & examples</h2>
            <p className="text-xs text-slate-400">These change tone and wording, not safety rules. Examples teach style; current catalog facts always win.</p>
            {([['system_prompt', 'Client instructions'], ['style_notes', 'Style notes'], ['example_customer', 'Example customer message'], ['example_reply', 'Example reply']] as const).map(([key, label]) => <label key={key} className="block text-xs text-slate-300 space-y-1">
              <span className="block">{label}</span>
              <textarea className="input w-full" rows={3} value={form[key]} maxLength={key === 'system_prompt' ? 30000 : 10000} onChange={event => { setForm({ ...form, [key]: event.target.value }); setDirty(true) }} />
            </label>)}
          </section>
        </fieldset>
        <div className="sticky bottom-0 bg-slate-950/95 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{activeBusiness.name} · {dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={save} disabled={!canManage || saving || !dirty}><Save size={16} /> {saving ? 'Saving…' : 'Save client configuration'}</button>
        </div>
      </>}
    </div>
  )
}
