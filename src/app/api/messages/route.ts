import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/business-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const session_id = searchParams.get('session_id')
    const business_id = searchParams.get('business_id')

    if (!session_id || !business_id) {
      return NextResponse.json({ error: 'session_id and business_id are required' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const access = await getBusinessAccess(serviceClient, user.id)
    if (!access.canAccess(business_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const { data: messages, error } = await serviceClient
      .from('wa_messages')
      .select('*')
      .eq('business_id', business_id)
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json({ error: 'Unable to load messages' }, { status: 500 })
    }

    return NextResponse.json({ messages: (messages ?? []).reverse() })
  } catch {
    return NextResponse.json({ error: 'Unable to load messages' }, { status: 500 })
  }
}
