'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Bot, Sparkles, MessageSquare, Save, HelpCircle,
  Clock, ShieldAlert, CheckCircle2, Building2, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'

type BusinessData = {
  id: string
  name: string
  system_prompt: string | null
  ai_tone: string | null
  services: string | null
  products: string | null
  prices: string | null
  faqs: string | null
  opening_hours: string | null
  contact_details: string | null
  booking_system: string | null
  handoff_message: string | null
}

type StyleProfile = {
  id?: string
  business_id: string
  approved: boolean
  style_notes: string | null
  example_customer: string | null
  example_reply: string | null
}

type Props = {
  businesses: BusinessData[]
  initialStyleProfiles: StyleProfile[]
  userRole: string
}

export function AISettingsClient({ businesses, initialStyleProfiles, userRole }: Props) {
  const [selectedBizId, setSelectedBizId] = useState(businesses[0]?.id || '')
  const [bizList, setBizList] = useState<BusinessData[]>(businesses)
  const [styles, setStyles] = useState<StyleProfile[]>(initialStyleProfiles)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()
  const currentBiz = bizList.find(b => b.id === selectedBizId) || businesses[0]
  const currentStyle = styles.find(s => s.business_id === selectedBizId) || {
    business_id: selectedBizId,
    approved: true,
    style_notes: '',
    example_customer: '',
    example_reply: '',
  }

  // Form states
  const [form, setForm] = useState({
    system_prompt: currentBiz?.system_prompt || '',
    ai_tone: currentBiz?.ai_tone || 'professional, warm, helpful, and concise',
    services: currentBiz?.services || '',
    prices: currentBiz?.prices || '',
    faqs: currentBiz?.faqs || '',
    opening_hours: currentBiz?.opening_hours || '',
    contact_details: currentBiz?.contact_details || '',
    handoff_message: currentBiz?.handoff_message || 'I have connected you with a human team member. Someone will assist you shortly!',
    style_notes: currentStyle?.style_notes || '',
    example_customer: currentStyle?.example_customer || '',
    example_reply: currentStyle?.example_reply || '',
  })

  function handleBizChange(id: string) {
    setSelectedBizId(id)
    const b = bizList.find(x => x.id === id)
    const s = styles.find(x => x.business_id === id)
    setForm({
      system_prompt: b?.system_prompt || '',
      ai_tone: b?.ai_tone || 'professional, warm, helpful, and concise',
      services: b?.services || '',
      prices: b?.prices || '',
      faqs: b?.faqs || '',
      opening_hours: b?.opening_hours || '',
      contact_details: b?.contact_details || '',
      handoff_message: b?.handoff_message || 'I have connected you with a human team member. Someone will assist you shortly!',
      style_notes: s?.style_notes || '',
      example_customer: s?.example_customer || '',
      example_reply: s?.example_reply || '',
    })
  }

  async function handleSave() {
    if (!selectedBizId) return
    setSaving(true)
    try {
      // 1. Update businesses table
      const bizUpdates: any = {
        system_prompt: form.system_prompt,
        ai_tone: form.ai_tone,
        services: form.services,
        prices: form.prices,
        faqs: form.faqs,
        opening_hours: form.opening_hours,
        contact_details: form.contact_details,
        handoff_message: form.handoff_message,
        updated_at: new Date().toISOString(),
      }

      const { error: bizErr } = await (supabase.from('businesses') as any)
        .update(bizUpdates)
        .eq('id', selectedBizId)

      if (bizErr) throw bizErr

      // 2. Update/upsert response_style_profiles
      const stylePayload: any = {
        business_id: selectedBizId,
        approved: true,
        style_notes: form.style_notes,
        example_customer: form.example_customer,
        example_reply: form.example_reply,
      }

      await (supabase.from('response_style_profiles') as any)
        .upsert(stylePayload, { onConflict: 'business_id' })

      // Update local state
      setBizList(prev => prev.map(b => b.id === selectedBizId ? { ...b, ...bizUpdates } : b))
      setStyles(prev => {
        const idx = prev.findIndex(s => s.business_id === selectedBizId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], ...stylePayload }
          return next
        }
        return [...prev, stylePayload]
      })

      toast.success('AI configuration saved! Live automation will use updated context.')
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-green-400" />
            AI Bot Configuration
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure the AI personality, business knowledge base, FAQs, and human handoff behavior.
          </p>
        </div>

        {businesses.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Editing:</span>
            <select
              value={selectedBizId}
              onChange={e => handleBizChange(e.target.value)}
              className="input text-xs py-1.5 px-3 bg-[rgb(var(--bg-secondary))] font-medium"
            >
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main form */}
      <div className="space-y-6">
        {/* Personality & Tone */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-green-400" />
            Persona & System Instructions
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">
                Custom System Prompt Instructions
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Special rules injected into the n8n LangChain agent (e.g. language preferences, greetings, discount limits).
              </p>
              <textarea
                rows={4}
                value={form.system_prompt}
                onChange={e => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="e.g. Always answer concisely in the customer's language (Hindi, Hinglish, or English). Never quote discounts without human approval."
                className="input w-full font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-300 font-medium block mb-1">AI Tone</label>
                <input
                  type="text"
                  value={form.ai_tone}
                  onChange={e => setForm({ ...form, ai_tone: e.target.value })}
                  placeholder="e.g. Warm, polite, conversational, professional"
                  className="input w-full text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Human Handoff Message</label>
                <input
                  type="text"
                  value={form.handoff_message}
                  onChange={e => setForm({ ...form, handoff_message: e.target.value })}
                  placeholder="Message sent right before pausing the bot for a human agent"
                  className="input w-full text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Base & Catalog */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            Business Knowledge & Catalog
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Services Offered</label>
              <textarea
                rows={3}
                value={form.services}
                onChange={e => setForm({ ...form, services: e.target.value })}
                placeholder="e.g. Dental cleaning, root canal, teeth whitening, emergency toothache care"
                className="input w-full"
              />
            </div>

            <div>
              <label className="text-slate-300 font-medium block mb-1">Prices / Fee Range</label>
              <textarea
                rows={3}
                value={form.prices}
                onChange={e => setForm({ ...form, prices: e.target.value })}
                placeholder="e.g. Consultation: ₹500, Cleaning: ₹1500, Whitening: ₹4000"
                className="input w-full"
              />
            </div>

            <div>
              <label className="text-slate-300 font-medium block mb-1">Frequently Asked Questions (FAQs)</label>
              <textarea
                rows={4}
                value={form.faqs}
                onChange={e => setForm({ ...form, faqs: e.target.value })}
                placeholder="Q: Do you accept insurance? A: Yes, all major providers.&#10;Q: Is parking available? A: Yes, valet parking on-site."
                className="input w-full leading-relaxed"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Opening Hours</label>
                <input
                  type="text"
                  value={form.opening_hours}
                  onChange={e => setForm({ ...form, opening_hours: e.target.value })}
                  placeholder="e.g. Mon-Sat: 10:00 AM - 8:00 PM, Sun: Closed"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Contact Details & Address</label>
                <input
                  type="text"
                  value={form.contact_details}
                  onChange={e => setForm({ ...form, contact_details: e.target.value })}
                  placeholder="e.g. Phone: +91 9876543210, Address: Suite 402, MG Road, Bengaluru"
                  className="input w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Few-Shot Style Profile (response_style_profiles) */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            Few-Shot Response Style & Golden Examples
          </h2>
          <p className="text-[11px] text-slate-500">
            The active n8n AI workflow uses these examples to mirror your exact brand voice and tone.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Sample Customer Inbound</label>
              <textarea
                rows={3}
                value={form.example_customer}
                onChange={e => setForm({ ...form, example_customer: e.target.value })}
                placeholder="e.g. Bhai mujhe appointment chahiye kal subah ke liye, kya charges hain?"
                className="input w-full"
              />
            </div>

            <div>
              <label className="text-slate-300 font-medium block mb-1">Ideal Bot Reply (Golden Example)</label>
              <textarea
                rows={3}
                value={form.example_reply}
                onChange={e => setForm({ ...form, example_reply: e.target.value })}
                placeholder="e.g. Namaste! Kal subah 11:00 AM ka slot available hai. Consultation charges ₹500 hain. Kya main aapke liye yeh slot book kar doon?"
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving to Database...' : 'Save AI Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
