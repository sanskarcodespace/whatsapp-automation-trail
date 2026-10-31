import { getBusinessAccess } from '@/lib/business-access'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsClient } from '@/components/leads/LeadsClient'

export const metadata = { title: 'Leads — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const access = await getBusinessAccess(serviceClient, user.id)
  const memberships = access.memberships

  const requestedBusiness = (await searchParams)?.business
  const businessIds = access.businessIds.filter(businessId => !requestedBusiness || businessId === requestedBusiness)

  const { data: leads } = await serviceClient
    .from('leads')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(200)

  const { data: businessTypes } = businessIds.length ? await serviceClient.from('businesses').select('id,industry').in('id', businessIds) : { data: [] }
  return <LeadsClient key={businessIds.join(',')} initialLeads={leads ?? []} businessIds={businessIds} userId={user.id} realEstateBusinessIds={(businessTypes ?? []).filter(business => business.industry === 'real_estate').map(business => business.id)} />
}
