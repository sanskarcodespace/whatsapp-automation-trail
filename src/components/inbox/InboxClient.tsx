'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Filter, Bot, User, Send, Loader2, MoreVertical,
  Phone, Tag, Clock, ChevronRight, AlertTriangle, CheckCircle2,
  Pause, Play, X, StickyNote, MessageSquare, RefreshCw
} from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'

type Conversation = {
  id: string | null
  session_id: string
  business_id: string | null
  customer_phone: string | null
  customer_name: string | null
  human_takeover: boolean
  status: string | null
  last_message?: string | null
  last_message_at: string | null
  unread_count: number
  tags: string[]
  assigned_agent_id: string | null
}

type Message = {
  id: string
  wa_message_id: string | null
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string | null
  customer_name: string | null
  agent_id: string | null
  is_manual_reply: boolean
  created_at: string
  metadata: any
}

const FILTERS = ['all', 'unread', 'human', 'ai', 'open', 'closed'] as const
type Filter = typeof FILTERS[number]

export function InboxClient({
  initialConversations,
  initialMessages = [],
  businessIds,
  userId,
  userRole,
}: {
  initialConversations: Conversation[]
  initialMessages?: Message[]
  businessIds: string[]
  userId: string
  userRole: string
}) {
  const [convs, setConvs] = useState<Conversation[]>(initialConversations)
  const [selected, setSelected] = useState<Conversation | null>(initialConversations[0] || null)
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [msgLoading, setMsgLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [aiToggling, setAiToggling] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const loadMessages = useCallback(async (conv: Conversation) => {
    if (!conv?.session_id) return
    setMsgLoading(true)
    try {
      const res = await fetch(`/api/messages?session_id=${encodeURIComponent(conv.session_id)}`)
      if (res.ok) {
        const json = await res.json()
        setMessages(json.messages ?? [])
      } else {
        const { data } = await supabase
          .from('wa_messages')
          .select('*')
          .eq('session_id', conv.session_id)
          .order('created_at', { ascending: true })
          .limit(100)
        setMessages(data ?? [])
      }
    } catch {
      // ignore
    } finally {
      setMsgLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    }

    // Mark as read
    if (conv.unread_count > 0) {
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('session_id', conv.session_id)
    }
  }, [supabase])

  // Initial load for first conversation if initialMessages wasn't passed or needs refresh
  useEffect(() => {
    if (initialConversations[0] && initialMessages.length === 0) {
      loadMessages(initialConversations[0])
    }
  }, [initialConversations, initialMessages.length, loadMessages])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
      }, (payload: any) => {
        setConvs(prev => {
          const idx = prev.findIndex(c => c.session_id === payload.new?.session_id)
          if (payload.eventType === 'DELETE') return prev.filter(c => c.session_id !== payload.old?.session_id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = { ...updated[idx], ...payload.new }
            return updated.sort((a, b) =>
              new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
            )
          }
          return [payload.new, ...prev]
        })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wa_messages',
      }, (payload: any) => {
        if (selected && payload.new?.session_id === selected.session_id) {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new?.id || (m.wa_message_id && m.wa_message_id === payload.new?.wa_message_id))) return prev
            return [...prev, payload.new]
          })
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selected?.session_id, supabase])

  // Periodic fallback sync (every 3.5s) to guarantee real-time updates
  useEffect(() => {
    if (!selected?.session_id) return
    const interval = setInterval(async () => {
      // 1. Fetch latest messages for active conversation
      try {
        const res = await fetch(`/api/messages?session_id=${encodeURIComponent(selected.session_id)}`)
        if (res.ok) {
          const json = await res.json()
          const latestMsgs = json.messages ?? []
          if (latestMsgs.length > 0) {
            setMessages(prev => {
              if (latestMsgs.length !== prev.length || latestMsgs[latestMsgs.length - 1]?.id !== prev[prev.length - 1]?.id) {
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
                return latestMsgs
              }
              return prev
            })
          }
        }
      } catch {
        // ignore
      }

      // 2. Fetch latest conversation states
      if (businessIds.length > 0) {
        const { data: latestConvs } = await supabase
          .from('conversations')
          .select('*')
          .in('business_id', businessIds)
          .order('last_message_at', { ascending: false })
          .limit(50)

        if (latestConvs && latestConvs.length > 0) {
          setConvs(latestConvs)
        }
      }
    }, 3500)

    return () => clearInterval(interval)
  }, [selected?.session_id, businessIds, supabase])

  const selectConv = (conv: Conversation) => {
    setSelected(conv)
    setReplyText('')
    setNoteText('')
    setShowNote(false)
    loadMessages(conv)
  }

  async function sendReply() {
    if (!selected || !replyText.trim() || sending) return
    setSending(true)
    const text = replyText.trim()
    setReplyText('')

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selected.session_id,
          business_id: selected.business_id,
          customer_phone: selected.customer_phone,
          phone_number_id: selected.business_id, // resolved server-side
          message: text,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      toast.success('Message sent')
      if (selected) {
        loadMessages(selected)
      }
    } catch (err: any) {
      toast.error(err.message)
      setReplyText(text) // restore on failure
    }
    setSending(false)
  }

  async function toggleAI() {
    if (!selected || aiToggling) return
    setAiToggling(true)
    const newState = !selected.human_takeover
    try {
      const res = await fetch('/api/conversations/toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selected.session_id,
          human_takeover: newState,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update AI status')
      const label = newState ? 'AI paused — human takeover active' : 'AI resumed'
      toast.success(label)
      setSelected(prev => prev ? { ...prev, human_takeover: newState, status: 'open' } : prev)
      setConvs(prev => prev.map(c => c.session_id === selected.session_id ? { ...c, human_takeover: newState, status: 'open' } : c))
    } catch (err: any) {
      toast.error('Failed to update AI status: ' + err.message)
    } finally {
      setAiToggling(false)
    }
  }

  async function saveNote() {
    if (!selected || !noteText.trim()) return
    const { error } = await supabase.from('internal_notes').insert({
      business_id: selected.business_id!,
      session_id: selected.session_id,
      author_id: userId,
      body: noteText.trim(),
    })
    if (error) toast.error('Failed to save note')
    else { toast.success('Note saved'); setNoteText(''); setShowNote(false) }
  }

  // Filter conversations
  const filtered = convs.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (c.customer_name ?? '').toLowerCase().includes(q) ||
      (c.customer_phone ?? '').includes(q)
    const matchFilter =
      filter === 'all'    ? true :
      filter === 'unread' ? c.unread_count > 0 :
      filter === 'human'  ? c.human_takeover :
      filter === 'ai'     ? !c.human_takeover :
      filter === 'open'   ? c.status === 'open' || c.status === 'bot' || c.status === 'human' :
      filter === 'closed' ? c.status === 'closed' : true
    return matchSearch && matchFilter
  })

  return (
    <div className="flex h-full">
      {/* ── LEFT PANEL: Conversation List ── */}
      <div className="w-72 shrink-0 border-r border-[rgb(var(--border))] flex flex-col bg-[rgb(var(--bg-secondary))]">
        {/* Header */}
        <div className="p-3 border-b border-[rgb(var(--border))]">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="input pl-8 py-1.5 text-xs"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-2 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                  filter === f
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-[rgb(var(--bg-hover))]'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-600 text-xs gap-2">
              <MessageSquare className="w-6 h-6" />
              <span>No conversations</span>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.session_id}
                onClick={() => selectConv(conv)}
                className={clsx(
                  'w-full text-left px-3 py-3 border-b border-[rgb(var(--border))/0.5] transition-colors',
                  selected?.session_id === conv.session_id
                    ? 'bg-[rgb(var(--bg-hover))]'
                    : 'hover:bg-[rgb(var(--bg-card))]'
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Avatar */}
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    conv.human_takeover ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'
                  )}>
                    {(conv.customer_name?.[0] ?? conv.customer_phone?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-white truncate">
                        {conv.customer_name || conv.customer_phone || 'Unknown'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {conv.unread_count > 0 && (
                          <span className="bg-green-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-slate-500 truncate flex-1">
                        {conv.customer_phone}
                      </span>
                      {conv.human_takeover
                        ? <span className="badge-yellow text-[9px] px-1 py-0">Human</span>
                        : <span className="badge-green text-[9px] px-1 py-0">AI</span>
                      }
                    </div>
                    {conv.last_message && (
                      <p className="text-[11px] text-slate-400 truncate mt-1">
                        {conv.last_message}
                      </p>
                    )}
                    {conv.last_message_at && (
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── MIDDLE PANEL: Conversation ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
            <MessageSquare className="w-12 h-12" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--bg-secondary))]">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold',
                  selected.human_takeover ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'
                )}>
                  {(selected.customer_name?.[0] ?? selected.customer_phone?.[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {selected.customer_name || selected.customer_phone}
                  </div>
                  <div className="text-xs text-slate-500">{selected.customer_phone}</div>
                </div>
                {selected.human_takeover
                  ? <span className="badge-yellow"><AlertTriangle className="w-2.5 h-2.5" />Human handling</span>
                  : <span className="badge-green"><Bot className="w-2.5 h-2.5" />AI active</span>
                }
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAI}
                  disabled={aiToggling}
                  className={clsx(
                    'btn-secondary text-xs py-1.5 px-3',
                    selected.human_takeover ? 'border-green-500/30 text-green-400' : 'border-yellow-500/30 text-yellow-400'
                  )}
                >
                  {aiToggling ? <Loader2 className="w-3 h-3 animate-spin" /> :
                    selected.human_takeover ? <><Play className="w-3 h-3" />Resume AI</> : <><Pause className="w-3 h-3" />Pause AI</>
                  }
                </button>
                <button onClick={() => setShowNote(!showNote)} className="btn-ghost text-xs py-1.5 px-3">
                  <StickyNote className="w-3 h-3" />Note
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={clsx('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                    <div className="skeleton h-10 w-48 rounded-2xl" />
                  </div>
                ))
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-600 text-sm py-10">No messages yet</div>
              ) : (
                messages.map((msg, i) => {
                  const isOut = msg.direction === 'outbound'
                  const isManual = msg.is_manual_reply
                  const showDate = i === 0 || (
                    new Date(msg.created_at).toDateString() !==
                    new Date(messages[i-1]?.created_at).toDateString()
                  )
                  return (
                    <div key={msg.id ?? i}>
                      {showDate && (
                        <div className="text-center text-[10px] text-slate-600 my-3">
                          {format(new Date(msg.created_at), 'EEEE, MMMM d')}
                        </div>
                      )}
                      <div className={clsx('flex gap-2', isOut ? 'justify-end' : 'justify-start')}>
                        {!isOut && (
                          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-300 shrink-0 mt-1">
                            {(selected.customer_name?.[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col gap-1 max-w-[75%]">
                          <div className={clsx(
                            isOut
                              ? isManual ? 'msg-outbound-manual' : 'msg-outbound'
                              : 'msg-inbound'
                          )}>
                            {msg.body || <span className="text-slate-500 italic text-xs">Empty message</span>}
                          </div>
                          <div className={clsx('flex items-center gap-1.5 text-[10px] text-slate-600',
                            isOut ? 'justify-end' : 'justify-start'
                          )}>
                            <span>{format(new Date(msg.created_at), 'HH:mm')}</span>
                            {isOut && (
                              <>
                                {isManual
                                  ? <><User className="w-2.5 h-2.5 text-blue-400" /><span className="text-blue-400">Agent</span></>
                                  : <><Bot className="w-2.5 h-2.5 text-green-400" /><span className="text-green-400">AI</span></>
                                }
                                {msg.status === 'failed' && <span className="text-red-400">Failed</span>}
                                {msg.status === 'sent' && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Internal note input */}
            {showNote && (
              <div className="px-4 pb-2 border-t border-[rgb(var(--border))] pt-2 bg-yellow-500/5">
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Internal note (not visible to customer)…"
                    rows={2}
                    className="input text-xs resize-none border-yellow-500/30 bg-yellow-500/5"
                  />
                  <div className="flex flex-col gap-1">
                    <button onClick={saveNote} className="btn-primary text-xs py-1.5 px-3">
                      <StickyNote className="w-3 h-3" />Save
                    </button>
                    <button onClick={() => setShowNote(false)} className="btn-ghost text-xs py-1.5 px-3">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reply composer */}
            <div className="px-4 py-3 border-t border-[rgb(var(--border))] bg-[rgb(var(--bg-secondary))]">
              {selected.human_takeover ? (
                <div className="text-xs text-slate-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  Human takeover active — AI is paused. You can still reply manually.
                </div>
              ) : null}
              <div className="flex gap-2 mt-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply()
                  }}
                  placeholder="Type a reply… (⌘+Enter to send)"
                  rows={2}
                  className="input text-sm resize-none flex-1"
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="btn-primary self-end px-4"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Manual replies are sent via your connected WhatsApp number and marked as agent messages.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT PANEL: Customer Info ── */}
      {selected && (
        <div className="w-64 shrink-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--bg-secondary))] overflow-y-auto p-4 space-y-4 animate-slide-in">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Customer</h3>
            <div className="space-y-2">
              <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Name" value={selected.customer_name} />
              <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={selected.customer_phone} mono />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Conversation</h3>
            <div className="space-y-2">
              <InfoRow icon={<Bot className="w-3.5 h-3.5" />} label="Status"
                value={
                  <span className={selected.human_takeover ? 'badge-yellow' : 'badge-green'}>
                    {selected.human_takeover ? 'Human handling' : 'AI active'}
                  </span>
                }
              />
              <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label="Last activity"
                value={selected.last_message_at
                  ? formatDistanceToNow(new Date(selected.last_message_at), { addSuffix: true })
                  : '—'}
              />
              {(selected.tags ?? []).length > 0 && (
                <InfoRow icon={<Tag className="w-3.5 h-3.5" />} label="Tags"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {selected.tags.map(t => <span key={t} className="badge-gray text-[10px]">{t}</span>)}
                    </div>
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value, mono }: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className={clsx('text-xs text-slate-200 truncate mt-0.5', mono && 'font-mono')}>
          {value ?? <span className="text-slate-600">—</span>}
        </div>
      </div>
    </div>
  )
}
