import { getBusinessAccess } from '@/lib/business-access'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InboxClient } from '@/components/inbox/InboxClient'

export const metadata = { title: 'Inbox — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function InboxPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const access = await getBusinessAccess(serviceClient, user.id)
  const memberships = access.memberships

  const requestedBusiness = (await searchParams)?.business
  const businessIds = access.businessIds.filter(businessId => !requestedBusiness || businessId === requestedBusiness)

  const userRole = memberships?.[0]?.role ?? 'agent'

  // Load initial conversations
  const { data: conversations } = await serviceClient
    .from('conversations')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(50)

  // Load initial messages for the first conversation
  const firstSessionId = conversations?.[0]?.session_id
  let initialMessages: Parameters<typeof InboxClient>[0]['initialMessages'] = []
  if (firstSessionId) {
    const { data: msgRows } = await serviceClient
      .from('wa_messages')
      .select('*')
      .eq('business_id', conversations![0].business_id!)
      .eq('session_id', firstSessionId)
      .order('created_at', { ascending: false })
      .limit(100)
    initialMessages = (msgRows ?? []).reverse()
  }

  return (
    <InboxClient
      key={businessIds.join(',')}
      initialConversations={conversations ?? []}
      initialMessages={initialMessages}
      businessIds={businessIds}
      userId={user.id}
      userRole={userRole}
    />
  )
}
