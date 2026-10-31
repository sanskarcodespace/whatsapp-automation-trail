'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AccessPage() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function checkAccess() {
    setBusy(true)
    try {
      const response = await fetch('/api/auth/accept-invitations', { method: 'POST' })
      const result = await response.json()
      if (!response.ok || result.destination === '/access') setMessage(result.error || 'No active client access yet. Ask your administrator to approve this email or restore access.')
      else { router.push(result.destination); router.refresh() }
    } catch { setMessage('Unable to check access. Please try again.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="card p-6 max-w-md space-y-4">
    <h1 className="text-xl font-semibold">Administrator approval required</h1>
    <p className="text-sm text-slate-400">Use the email your administrator approved and verify it. If your service is suspended, only your administrator can restore it. Never share your password with them.</p>
    <button className="btn-primary" disabled={busy} onClick={checkAccess}>{busy ? 'Checking…' : 'Check my access'}</button>
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    <button className="block text-sm text-green-300" onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh() }}>Sign in with another account</button>
  </section></main>
}
