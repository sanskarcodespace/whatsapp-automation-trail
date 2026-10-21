import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExportClient } from '@/components/export/ExportClient'

export const metadata = { title: 'Export — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function ExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role, businesses(id, name)')
    .eq('user_id', user.id)

  const businesses = (memberships ?? [])
    .map((m: any) => m.businesses)
    .filter(Boolean)

  return <ExportClient businesses={businesses} />
}
