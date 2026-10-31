import { getBusinessAccess } from '@/lib/business-access'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExportClient } from '@/components/export/ExportClient'

export const metadata = { title: 'Export — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function ExportPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const access = await getBusinessAccess(serviceClient, user.id)
  const memberships = access.memberships

  const requestedBusiness = (await searchParams)?.business
  const businessIds = access.businessIds.filter(businessId => !requestedBusiness || businessId === requestedBusiness)
  let businesses: Parameters<typeof ExportClient>[0]['businesses'] = []
  if (businessIds.length > 0) {
    const { data: bizRows } = await serviceClient.from('businesses').select('id, name').in('id', businessIds)
    businesses = bizRows ?? []
  }

  return <ExportClient businesses={businesses} />
}
