import { getBusinessAccess } from '@/lib/business-access'
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
  const access = await getBusinessAccess(serviceClient, user.id)
  if (!access.businessIds.length) redirect('/access')
  const memberships = access.memberships

  const bizIds = (memberships ?? []).map(membership => membership.business_id).filter(Boolean)

  let businesses: Parameters<typeof Sidebar>[0]['businesses'] = []
  if (bizIds.length > 0) {
    const { data: bizRows } = await serviceClient
      .from('businesses')
      .select('id, name, phone_number_id, connection_status')
      .in('id', bizIds)

    const roleMap = new Map((memberships ?? []).map(membership => [membership.business_id, membership.role]))
    businesses = (bizRows ?? []).map(b => ({
      ...b,
      role: roleMap.get(b.id) || 'agent',
    }))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--bg-primary))]">
      <Sidebar user={user} businesses={businesses} canAdmin={access.canProvision} />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
