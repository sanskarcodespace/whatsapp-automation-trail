import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InboxClient } from '@/components/inbox/InboxClient'

export const metadata = { title: 'Inbox — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)

  const businessIds = (memberships ?? []).map((m: any) => m.business_id).filter(Boolean)
  const userRole = memberships?.[0]?.role ?? 'agent'

  // Load initial conversations
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .in('business_id', businessIds)
    .order('last_message_at', { ascending: false })
    .limit(50)

  return (
    <InboxClient
      initialConversations={conversations ?? []}
      businessIds={businessIds}
      userId={user.id}
      userRole={userRole}
    />
  )
}
