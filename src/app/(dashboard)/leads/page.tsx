import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsClient } from '@/components/leads/LeadsClient'

export const metadata = { title: 'Leads — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(200)

  return <LeadsClient initialLeads={leads ?? []} businessIds={businessIds} userId={user.id} />
}
