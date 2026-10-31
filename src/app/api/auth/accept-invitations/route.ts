import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/business-access'

export async function POST() {
  try {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service = await createServiceClient()
    const { error } = await service.rpc('crm_accept_client_invites', { p_user_id: user.id })
    if (error) return NextResponse.json({ error: 'Account access is not ready. Ask your administrator to complete setup.' }, { status: 503 })
    const access = await getBusinessAccess(service, user.id)
    return NextResponse.json({ destination: access.canProvision ? '/admin' : access.businessIds.length ? '/' : '/access' })
  } catch {
    return NextResponse.json({ error: 'Unable to verify account access' }, { status: 503 })
  }
}
