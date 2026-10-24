import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord } from '@/lib/business-access'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!isRecord(body) || typeof body.session_id !== 'string' || !body.session_id ||
      typeof body.business_id !== 'string' || !body.business_id || typeof body.human_takeover !== 'boolean') {
      return NextResponse.json({ error: 'business_id, session_id and boolean human_takeover are required' }, { status: 400 })
    }
    const { session_id, business_id, human_takeover } = body

    const serviceClient = await createServiceClient()
    const access = await getBusinessAccess(serviceClient, user.id)
    if (!access.canAccess(business_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const now = new Date().toISOString()
    const { data, error } = await serviceClient
      .from('conversations')
      .update({
        human_takeover,
        status: human_takeover ? 'human' : 'bot',
        updated_at: now,
      })
      .eq('business_id', business_id)
      .eq('session_id', session_id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Unable to update conversation' }, { status: 500 })
    }

    if (!data) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    return NextResponse.json({ success: true, conversation: data })
  } catch {
    return NextResponse.json({ error: 'Unable to update conversation' }, { status: 500 })
  }
}
