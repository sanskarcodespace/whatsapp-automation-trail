import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { session_id, human_takeover } = body

    if (!session_id || human_takeover === undefined) {
      return NextResponse.json({ error: 'Missing session_id or human_takeover' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const now = new Date().toISOString()
    const { data, error } = await serviceClient
      .from('conversations')
      .update({
        human_takeover: Boolean(human_takeover),
        status: 'open',
        updated_at: now,
      })
      .eq('session_id', session_id)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversation: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
