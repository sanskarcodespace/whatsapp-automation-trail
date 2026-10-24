import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExportClient } from '@/components/export/ExportClient'

export const metadata = { title: 'Export — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function ExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map(membership => membership.business_id).filter(Boolean)
  let businesses: Parameters<typeof ExportClient>[0]['businesses'] = []
  if (businessIds.length > 0) {
    const { data: bizRows } = await serviceClient.from('businesses').select('id, name').in('id', businessIds)
    businesses = bizRows ?? []
  }

  return <ExportClient businesses={businesses} />
}
