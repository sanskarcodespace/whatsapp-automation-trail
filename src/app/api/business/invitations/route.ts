import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord } from '@/lib/business-access'

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!isRecord(body) || typeof body.business_id !== 'string' || typeof body.email !== 'string' || body.email.length > 254) return NextResponse.json({ error: 'Select a client and email' }, { status: 400 })
    const service = await createServiceClient()
    const access = await getBusinessAccess(service, user.id)
    if (!access.canAdmin(body.business_id)) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
    const { error } = await service.rpc('crm_set_client_invitation', { p_actor_id: user.id, p_business_id: body.business_id, p_email: body.email, p_revoke: true })
    if (error) return NextResponse.json({ error: 'Unable to revoke access' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unable to revoke access' }, { status: 500 })
  }
}
