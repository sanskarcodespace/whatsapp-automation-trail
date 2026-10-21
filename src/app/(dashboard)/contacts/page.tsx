import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContactsClient, Contact } from '@/components/contacts/ContactsClient'

export const metadata = { title: 'Contacts — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role, businesses(id, name)')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  const businesses = (memberships ?? [])
    .map((m: any) => m.businesses)
    .filter(Boolean)

  let contacts: Contact[] = []
  if (businessIds.length > 0) {
    // Distinct contacts can be aggregated from conversations & leads
    const { data: convData } = await supabase
      .from('conversations')
      .select('customer_phone, customer_name, business_id, last_message_at, session_id, human_takeover')
      .in('business_id', businessIds)
      .order('last_message_at', { ascending: false })
      .limit(200)

    // Also get lead statuses
    const { data: leadData } = await supabase
      .from('leads')
      .select('customer_phone, business_id, status')
      .in('business_id', businessIds)

    const leadMap = new Map<string, string>()
    ;(leadData ?? []).forEach((l: any) => {
      if (l.customer_phone && l.business_id) {
        leadMap.set(`${l.business_id}:${l.customer_phone}`, l.status)
      }
    })

    const seen = new Set<string>()
    ;(convData ?? []).forEach((c: any) => {
      if (!c.customer_phone) return
      const key = `${c.business_id}:${c.customer_phone}`
      if (seen.has(key)) return
      seen.add(key)

      contacts.push({
        customer_phone: c.customer_phone,
        customer_name: c.customer_name,
        business_id: c.business_id,
        last_message_at: c.last_message_at,
        lead_status: leadMap.get(key) ?? 'new',
        session_id: c.session_id,
        human_takeover: c.human_takeover ?? false,
      })
    })
  }

  return (
    <ContactsClient
      contacts={contacts}
      businesses={businesses}
    />
  )
}
