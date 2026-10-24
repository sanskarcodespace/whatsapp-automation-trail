import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AISettingsClient } from '@/components/ai/AISettingsClient'
import { publicAISettings } from '@/lib/business-access'

export const metadata = { title: 'AI Bot Settings — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function AISettingsPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map(membership => membership.business_id).filter(Boolean)
  let businesses: Parameters<typeof AISettingsClient>[0]['businesses'] = []
  if (businessIds.length > 0) {
    const { data: bizRows } = await serviceClient.from('businesses')
      .select('id, name, system_prompt, settings, ai_tone, services, products, prices, faqs, opening_hours, contact_details, booking_system, handoff_message')
      .in('id', businessIds)
    businesses = (bizRows ?? []).map(business => ({ ...business, settings: publicAISettings(business.settings) }))
  }
  const requestedBusiness = (await searchParams)?.business
  if (requestedBusiness) businesses.sort((first, second) => Number(second.id === requestedBusiness) - Number(first.id === requestedBusiness))

  const manageableBusinessIds = (memberships ?? []).filter(membership => ['platform_admin', 'owner', 'manager'].includes(membership.role)).map(membership => membership.business_id)

  let styles: Parameters<typeof AISettingsClient>[0]['initialStyleProfiles'] = []
  if (businessIds.length > 0) {
    const { data } = await serviceClient
      .from('response_style_profiles')
      .select('*')
      .in('business_id', businessIds)

    styles = data ?? []
  }

  return (
    <AISettingsClient
      businesses={businesses}
      initialStyleProfiles={styles}
      manageableBusinessIds={manageableBusinessIds}
    />
  )
}
