'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function signup(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      if (error) throw error
      setPassword('')
      setMessage('Check your email to verify your account, then ask your operator to assign you to a client. If you already have an account, sign in instead.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create account')
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-screen flex items-center justify-center p-6">
    <div className="card p-6 max-w-md w-full space-y-5">
      <h1 className="text-xl text-white font-semibold">Create your CRM account</h1>
      <p className="text-sm text-slate-400">Creating an account grants no client access. An authorized operator or owner assigns your role after email verification.</p>
      <form onSubmit={signup} className="space-y-4">
        <label className="block text-xs text-slate-300 space-y-1">Email
          <input type="email" required autoComplete="email" className="input w-full" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
        </label>
        <label className="block text-xs text-slate-300 space-y-1">Password (at least 12 characters)
          <input type="password" required minLength={12} autoComplete="new-password" className="input w-full" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
      <Link href="/login" className="text-sm text-green-300">Back to sign in</Link>
    </div>
  </main>
}
