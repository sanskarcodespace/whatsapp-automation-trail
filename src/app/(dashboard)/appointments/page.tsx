import { getBusinessAccess } from '@/lib/business-access'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentsClient, Appointment } from '@/components/appointments/AppointmentsClient'

export const metadata = { title: 'Appointments — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function AppointmentsPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = await createServiceClient()

  const access = await getBusinessAccess(serviceClient, user.id)
  const memberships = access.memberships

  const requestedBusiness = (await searchParams)?.business
  const businessIds = access.businessIds.filter(businessId => !requestedBusiness || businessId === requestedBusiness)
  let businesses: Parameters<typeof AppointmentsClient>[0]['businesses'] = []
  if (businessIds.length > 0) {
    const { data: bizRows } = await serviceClient.from('businesses').select('id, name').in('id', businessIds)
    businesses = bizRows ?? []
  }

  const userRole = memberships?.[0]?.role ?? 'agent'

  let appointments: Appointment[] = []
  if (businessIds.length > 0) {
    const { data } = await serviceClient
      .from('appointment_requests')
      .select('*')
      .in('business_id', businessIds)
      .order('created_at', { ascending: false })
      .limit(100)

    appointments = (data as unknown as Appointment[]) ?? []
  }

  return (
    <AppointmentsClient
      key={businessIds.join(',')}
      initialAppointments={appointments}
      businessIds={businessIds}
      businesses={businesses}
      userRole={userRole}
    />
  )
}
