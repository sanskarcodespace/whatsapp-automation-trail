import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient, BusinessRecord, TeamMember } from '@/components/settings/SettingsClient'

export const metadata = { title: 'Settings — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role, businesses(*)')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  const businesses = (memberships ?? [])
    .map((m: any) => m.businesses)
    .filter(Boolean) as unknown as BusinessRecord[]

  const userRole = memberships?.[0]?.role ?? 'agent'

  let teamMembers: TeamMember[] = []
  if (businessIds.length > 0) {
    const { data } = await supabase
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
