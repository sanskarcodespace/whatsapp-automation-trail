import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  // Fetch user's business memberships
  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  const bizIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)

  let businesses: any[] = []
  if (bizIds.length > 0) {
    const { data: bizRows } = await serviceClient
      .from('businesses')
      .select('*')
      .in('id', bizIds)

    const roleMap = new Map((memberships ?? []).map((m: any) => [m.business_id, m.role]))
    businesses = (bizRows ?? []).map((b: any) => ({
      ...b,
      role: roleMap.get(b.id) || 'agent',
    }))
  }

  // If no explicit membership yet, auto-link to existing businesses for platform admin
  if (businesses.length === 0) {
    const { data: allBiz } = await serviceClient.from('businesses').select('*').limit(5)
    businesses = (allBiz ?? []).map((b: any) => ({ ...b, role: 'platform_admin' }))
    if (allBiz && allBiz[0]) {
      await serviceClient.from('business_members').upsert({
        business_id: allBiz[0].id,
        user_id: user.id,
        role: 'platform_admin'
      }, { onConflict: 'business_id,user_id' })
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--bg-primary))]">
      <Sidebar user={user} businesses={businesses} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
