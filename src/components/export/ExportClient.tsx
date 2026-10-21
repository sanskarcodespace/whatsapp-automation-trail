'use client'
import { useState } from 'react'
import {
  FileDown, Download, Filter, Calendar, FileText,
  CheckCircle2, AlertCircle, Building2, Loader2, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'

type Props = {
  businesses: { id: string; name: string }[]
}

export function ExportClient({ businesses }: Props) {
  const [selectedBiz, setSelectedBiz] = useState(businesses[0]?.id || 'all')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [days, setDays] = useState('30')
  const [direction, setDirection] = useState('all')
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        business_id: selectedBiz,
        format,
        days,
        direction,
      })

      const res = await fetch(`/api/export?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(err.error || 'Export request failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whatsapp_chat_export_${selectedBiz}_${Date.now()}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast.success(`Export downloaded (${format.toUpperCase()})`)
    } catch (err: any) {
      toast.error(err.message || 'Download error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileDown className="w-6 h-6 text-green-400" />
          Chat Export
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Export WhatsApp conversation records, customer details, and message logs for auditing or reporting.
        </p>
      </div>

      {/* Export Configuration Card */}
      <div className="card p-6 space-y-6">
        <h2 className="text-sm font-semibold text-white">Export Parameters</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Business */}
          <div>
            <label className="text-slate-400 block mb-1 font-medium">Business / Client</label>
            <select
              value={selectedBiz}
              onChange={e => setSelectedBiz(e.target.value)}
              className="input w-full"
            >
              {businesses.length > 1 && <option value="all">All Accessible Businesses</option>}
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Time range */}
          <div>
            <label className="text-slate-400 block mb-1 font-medium">Date Range</label>
            <select
              value={days}
              onChange={e => setDays(e.target.value)}
              className="input w-full"
            >
              <option value="1">Last 24 Hours</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="365">Last 1 Year</option>
            </select>
          </div>

          {/* Message direction */}
          <div>
            <label className="text-slate-400 block mb-1 font-medium">Message Direction</label>
            <select
              value={direction}
              onChange={e => setDirection(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Messages (Inbound & Outbound)</option>
              <option value="inbound">Inbound Only (Customer queries)</option>
              <option value="outbound">Outbound Only (AI & Agent replies)</option>
            </select>
          </div>

          {/* File Format */}
          <div>
            <label className="text-slate-400 block mb-1 font-medium">File Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                  format === 'csv'
                    ? 'border-green-500 bg-green-500/15 text-green-400'
                    : 'border-[rgb(var(--border))] text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> CSV (Excel-ready)
              </button>
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                  format === 'json'
                    ? 'border-green-500 bg-green-500/15 text-green-400'
                    : 'border-[rgb(var(--border))] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> JSON (Raw data)
              </button>
            </div>
          </div>
        </div>

        {/* Feature note */}
        <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
          <div className="font-medium text-slate-300">Encoding & Compatibility:</div>
          <div>• CSV includes a standard UTF-8 Byte Order Mark (BOM), ensuring Devnagari (Hindi), Hinglish, emojis, and punctuation render cleanly without character corruptions in Microsoft Excel, Google Sheets, or Apple Numbers.</div>
          <div>• Includes message direction, customer phone, timestamp, intent, lead stage, and manual reply indicators.</div>
        </div>

        {/* Download action */}
        <div className="flex items-center justify-end pt-2 border-t border-[rgb(var(--border))]">
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="btn-primary text-xs px-4 py-2"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Export...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download {format.toUpperCase()} Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
