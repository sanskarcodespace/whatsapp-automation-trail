import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, INDUSTRIES } from '@/lib/business-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My workspace — WhatsApp CRM' }

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ business?: string }> } = {}) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const service = await createServiceClient()
  const access = await getBusinessAccess(service, user.id)
  const requestedBusiness = (await searchParams)?.business
  if (access.canProvision) redirect(`/admin${requestedBusiness && access.canAdmin(requestedBusiness) ? `?business=${encodeURIComponent(requestedBusiness)}` : ''}`)
  const businessIds = access.businessIds.filter(businessId => !requestedBusiness || businessId === requestedBusiness)
  const { data: businesses } = businessIds.length ? await service.from('businesses').select('id,name,industry,is_active,connection_status').in('id', businessIds) : { data: [] }
  return <div className="p-6 max-w-3xl mx-auto space-y-5"><h1 className="text-2xl font-semibold">My workspace</h1><p className="text-sm text-slate-400">Your administrator handles account access, WhatsApp connection and service activation. You manage your business information and customer conversations.</p>
    {(businesses ?? []).map(business => <section key={business.id} className="card p-5 space-y-3"><h2 className="font-semibold">{business.name}</h2><p className="text-sm text-slate-400">{INDUSTRIES[business.industry]} · {business.is_active ? 'Automatic replies enabled' : 'Automatic replies paused — contact your administrator'}</p><Link className="text-green-300 text-sm" href={`/ai?business=${business.id}`}>Business information & AI setup →</Link></section>)}
    {!businesses?.length && <p className="text-sm text-slate-400">No allowed client workspace. Contact your administrator.</p>}
    <p className="text-xs text-slate-500">Never share your password. Client accounts cannot create businesses, grant access or resume suspended service.</p>
  </div>
}
