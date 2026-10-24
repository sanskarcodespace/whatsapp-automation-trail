import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord } from '@/lib/business-access'
import type { Json } from '@/types/database'

export const dynamic = 'force-dynamic'

async function manage(req: NextRequest, action: 'create' | 'update' | 'upsert_member' | 'remove_member') {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => null)
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid JSON object' }, { status: 400 })
    const { business_id, ...payload } = body
    if (action !== 'create' && (typeof business_id !== 'string' || !business_id)) {
      return NextResponse.json({ error: 'Select a client' }, { status: 400 })
    }
    const memberAction = action === 'upsert_member' || action === 'remove_member'
    const allowed = memberAction ? ['email', 'role', 'user_id'] : ['name', 'phone_number_id', 'waba_id', 'timezone', 'owner_phone', 'is_active']
    if (Object.keys(payload).some(key => !allowed.includes(key)) || JSON.stringify(payload).length > 5000 ||
      Object.entries(payload).some(([key, value]) => key === 'is_active' ? typeof value !== 'boolean' : typeof value !== 'string') ||
      (!memberAction && ((action === 'create' || payload.name !== undefined) && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 160))) ||
      ['phone_number_id', 'waba_id'].some(key => (action === 'create' || payload[key] !== undefined) && !/^[0-9]{6,30}$/.test(String(payload[key] ?? ''))) ||
      (payload.owner_phone !== undefined && payload.owner_phone !== '' && !/^[1-9][0-9]{6,14}$/.test(String(payload.owner_phone))) ||
      (action === 'create' && payload.is_active !== undefined) ||
      (action === 'upsert_member' && (typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || !['owner', 'manager', 'agent'].includes(String(payload.role)))) ||
      (action === 'remove_member' && typeof payload.user_id !== 'string')) {
      return NextResponse.json({ error: 'Invalid client fields' }, { status: 400 })
    }
    const serviceClient = await createServiceClient()
    const access = await getBusinessAccess(serviceClient, user.id)
    const permitted = action === 'create' ? access.canProvision : memberAction ? access.canManageMembers(String(business_id)) : access.canManage(String(business_id))
    if (!permitted) return NextResponse.json({ error: 'Your role cannot perform this action for this client' }, { status: 403 })
    const { data, error } = await serviceClient.rpc('crm_manage_client', {
      p_actor_id: user.id, p_action: action,
      ...(typeof business_id === 'string' ? { p_business_id: business_id } : {}),
      p_payload: payload as Json,
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That WhatsApp number is already assigned to a client' }, { status: 409 })
      if (error.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ error: 'Unable to save. Check that CRM migration 006 is deployed and your access is current.' }, { status: 503 })
    }
    return NextResponse.json({ success: true, result: data })
  } catch {
    return NextResponse.json({ error: 'Unable to update client' }, { status: 500 })
  }
}

export const POST = (req: NextRequest) => manage(req, 'create')
export const PATCH = (req: NextRequest) => manage(req, 'update')
export const PUT = (req: NextRequest) => manage(req, 'upsert_member')
export const DELETE = (req: NextRequest) => manage(req, 'remove_member')
