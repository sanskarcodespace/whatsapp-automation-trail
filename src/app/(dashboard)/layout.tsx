import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch user's business memberships
  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role, businesses(*)')
    .eq('user_id', user.id)

  const businesses = (memberships ?? [])
    .map((m: any) => ({ ...(m.businesses || {}), role: m.role }))
    .filter((b: any) => b.id)

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--bg-primary))]">
      <Sidebar user={user} businesses={businesses} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
