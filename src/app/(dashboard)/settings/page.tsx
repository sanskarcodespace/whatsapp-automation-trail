import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient, BusinessRecord, TeamMember } from '@/components/settings/SettingsClient'

export const metadata = { title: 'Settings — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  let businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  let businesses: BusinessRecord[] = []
  if (businessIds.length === 0) {
    const { data: allBiz } = await serviceClient.from('businesses').select('*')
    businesses = (allBiz as unknown as BusinessRecord[]) ?? []
    businessIds = businesses.map(b => b.id)
  } else {
    const { data: bizRows } = await serviceClient.from('businesses').select('*').in('id', businessIds)
    businesses = (bizRows as unknown as BusinessRecord[]) ?? []
  }

  const userRole = memberships?.[0]?.role ?? 'platform_admin'

  let teamMembers: TeamMember[] = []
  if (businessIds.length > 0) {
    const { data } = await serviceClient
      .from('business_members')
      .select('*')
      .in('business_id', businessIds)

    teamMembers = (data as unknown as TeamMember[]) ?? []
  }

  return (
    <SettingsClient
      businesses={businesses}
      teamMembers={teamMembers}
      userId={user.id}
      userRole={userRole}
    />
  )
}
