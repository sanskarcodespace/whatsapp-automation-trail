import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord, publicAISettings, validAISettings } from '@/lib/business-access'
import type { Json } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid JSON object' }, { status: 400 })
    const { business_id, system_prompt, settings, style } = body
    if (typeof business_id !== 'string' || !business_id) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    if ((system_prompt !== undefined && (typeof system_prompt !== 'string' || system_prompt.length > 30000)) ||
      (settings !== undefined && !validAISettings(settings)) ||
      (style !== undefined && (!isRecord(style) || Object.entries(style).some(([key, value]) =>
        !['style_notes', 'example_customer', 'example_reply'].includes(key) || typeof value !== 'string' || value.length > 10000)))) {
      return NextResponse.json({ error: 'Invalid AI settings fields' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const access = await getBusinessAccess(serviceClient, user.id)
    if (!access.canManage(business_id)) return NextResponse.json({ error: 'Owner or manager access required' }, { status: 403 })

    const { data, error } = await serviceClient.rpc('crm_save_ai_settings', {
      p_actor_id: user.id,
      p_business_id: business_id,
      p_settings: (settings ?? {}) as Json,
      ...(typeof system_prompt === 'string' ? { p_system_prompt: system_prompt } : {}),
      ...(isRecord(style) ? { p_style: style as Json } : {}),
    })
    if (error) return NextResponse.json({ error: 'Unable to save. Check that CRM migration 006 is deployed and your access is current.' }, { status: 503 })
    return NextResponse.json({ success: true, settings: publicAISettings(data) })
  } catch {
    return NextResponse.json({ error: 'Unable to save AI settings' }, { status: 500 })
  }
}
