import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentsClient, Appointment } from '@/components/appointments/AppointmentsClient'

export const metadata = { title: 'Appointments — WhatsApp CRM' }
export const dynamic = 'force-dynamic'

export default async function AppointmentsPage() {
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
  const userRole = memberships?.[0]?.role ?? 'agent'

  let appointments: Appointment[] = []
  if (businessIds.length > 0) {
    const { data } = await supabase
      .from('appointment_requests')
      .select('*')
      .in('business_id', businessIds)
      .order('created_at', { ascending: false })
      .limit(100)

    appointments = (data as unknown as Appointment[]) ?? []
  }

  return (
    <AppointmentsClient
      initialAppointments={appointments}
      businessIds={businessIds}
      businesses={businesses}
      userRole={userRole}
    />
  )
}
