import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AISettingsClient } from '@/components/ai/AISettingsClient'

export const metadata = { title: 'AI Bot Settings — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function AISettingsPage() {
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
    .filter(Boolean)
  const userRole = memberships?.[0]?.role ?? 'agent'

  let styles: any[] = []
  if (businessIds.length > 0) {
    const { data } = await supabase
      .from('response_style_profiles' as any)
      .select('*')
      .in('business_id', businessIds)

    styles = data ?? []
  }

  return (
    <AISettingsClient
      businesses={businesses}
      initialStyleProfiles={styles}
      userRole={userRole}
    />
  )
}
