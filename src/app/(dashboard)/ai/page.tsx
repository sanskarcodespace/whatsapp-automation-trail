import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AISettingsClient } from '@/components/ai/AISettingsClient'

export const metadata = { title: 'AI Bot Settings — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function AISettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  let businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  let businesses: any[] = []
  if (businessIds.length === 0) {
    const { data: allBiz } = await serviceClient.from('businesses').select('*')
    businesses = allBiz ?? []
    businessIds = businesses.map(b => b.id)
  } else {
    const { data: bizRows } = await serviceClient.from('businesses').select('*').in('id', businessIds)
    businesses = bizRows ?? []
  }

  const userRole = memberships?.[0]?.role ?? 'platform_admin'

  let styles: any[] = []
  if (businessIds.length > 0) {
    const { data } = await serviceClient
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
