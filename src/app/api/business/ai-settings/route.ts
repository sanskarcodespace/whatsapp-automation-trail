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
    const { business_id, system_prompt, settings, style } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    // 1. Fetch existing settings to merge cleanly
    const { data: currentBiz } = await serviceClient
      .from('businesses')
      .select('settings')
      .eq('id', business_id)
      .single()

    const mergedSettings = {
      ...(currentBiz?.settings || {}),
      ...(settings || {}),
    }

    // 2. Update businesses table (system_prompt and settings JSONB)
    const { error: bizErr } = await serviceClient
      .from('businesses')
      .update({
        system_prompt: system_prompt || '',
        settings: mergedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', business_id)

    if (bizErr) {
      return NextResponse.json({ error: bizErr.message }, { status: 500 })
    }

    // 3. Upsert response_style_profiles
    if (style) {
      const { error: styleErr } = await serviceClient
        .from('response_style_profiles')
        .upsert({
          business_id,
          approved: true,
          style_notes: style.style_notes || '',
          example_customer: style.example_customer || '',
          example_reply: style.example_reply || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id' })

      if (styleErr) {
        console.warn('[ai-settings] style upsert error:', styleErr)
      }
    }

    return NextResponse.json({
      success: true,
      settings: mergedSettings,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
