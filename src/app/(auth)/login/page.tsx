'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { MessageSquare, Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Welcome back!')
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) toast.error(error.message)
    else toast.success('Password reset link sent — check your email.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/15 border border-green-500/25 mb-4">
            <MessageSquare className="w-7 h-7 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">WhatsApp CRM</h1>
          <p className="text-sm text-slate-400 mt-1">Multi-tenant AI platform</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-5">
            {resetMode ? 'Reset Password' : 'Sign In'}
          </h2>

          <form onSubmit={resetMode ? handleReset : handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="input pl-9"
                />
              </div>
            </div>

            {!resetMode && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {resetMode ? 'Send Reset Link' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setResetMode(!resetMode)}
              className="text-xs text-slate-400 hover:text-green-400 transition-colors"
            >
              {resetMode ? '← Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          New team member? <Link href="/signup" className="text-green-400">Create an account</Link>, then ask your operator for client access.
        </p>
      </div>
    </div>
  )
}
