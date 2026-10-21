import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InboxClient } from '@/components/inbox/InboxClient'

export const metadata = { title: 'Inbox — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function InboxPage() {
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

  const userRole = memberships?.[0]?.role ?? 'platform_admin'

  // Load initial conversations
  const { data: conversations } = await serviceClient
    .from('conversations')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(50)

  // Load initial messages for the first conversation
  const firstSessionId = conversations?.[0]?.session_id
  let initialMessages: any[] = []
  if (firstSessionId) {
    const { data: msgRows } = await serviceClient
      .from('wa_messages')
      .select('*')
      .eq('session_id', firstSessionId)
      .order('created_at', { ascending: true })
      .limit(100)
    initialMessages = msgRows ?? []
  }

  return (
    <InboxClient
      initialConversations={conversations ?? []}
      initialMessages={initialMessages}
      businessIds={businessIds}
      userId={user.id}
      userRole={userRole}
    />
  )
}
