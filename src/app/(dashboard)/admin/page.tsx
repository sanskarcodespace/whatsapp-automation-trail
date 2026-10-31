import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/business-access'
import { ClientsAdmin } from '@/components/admin/ClientsAdmin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · All clients — WhatsApp CRM' }

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const service = await createServiceClient()
  const access = await getBusinessAccess(service, user.id)
  if (!access.canProvision) redirect('/')
  const businessIds = access.memberships.filter(member => member.role === 'platform_admin').map(member => member.business_id)
  const [{ data: businesses, error }, { data: invitations, error: invitationError }] = await Promise.all([
    service.from('businesses').select('id,name,industry,access_status,is_active,connection_status,phone_number_id,waba_id,timezone').in('id', businessIds).order('created_at', { ascending: false }),
    service.from('client_invitations').select('id,business_id,email,role,status,expires_at').in('business_id', businessIds).order('created_at', { ascending: false }),
  ])
  if (error || invitationError) return <p className="p-6 text-amber-200">Admin setup is not available yet. Apply migration 007 before using client onboarding.</p>
  return <ClientsAdmin businesses={businesses ?? []} invitations={invitations ?? []} selectedBusiness={(await searchParams)?.business} />
}
