import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsClient } from '@/components/leads/LeadsClient'

export const metadata = { title: 'Leads — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const { data: memberships } = await serviceClient
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  let businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  if (businessIds.length === 0) {
    const { data: allBiz } = await serviceClient.from('businesses').select('id')
    businessIds = (allBiz ?? []).map((b: any) => b.id)
  }

  const { data: leads } = await serviceClient
    .from('leads')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(200)

  return <LeadsClient initialLeads={leads ?? []} businessIds={businessIds} userId={user.id} />
}
