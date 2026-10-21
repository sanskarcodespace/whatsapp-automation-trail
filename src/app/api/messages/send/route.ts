import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// POST /api/messages/send
// Secure manual reply endpoint:
// 1. Authenticates the user via Supabase session
// 2. Verifies user has access to the target business
// 3. Verifies the conversation belongs to that business  
// 4. Sends via n8n webhook (which holds WhatsApp credentials server-side)
// 5. Saves the outbound message to wa_messages
// 6. Never exposes credentials to the browser

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { session_id, business_id, customer_phone, message } = body

    if (!session_id || !business_id || !customer_phone || !message?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (message.trim().length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 characters)' }, { status: 400 })
    }

    // 2. Verify user has access to this business
    const { data: membership } = await supabase
      .from('business_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('business_id', business_id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 })
    }

    // 3. Verify conversation belongs to this business (using service client for RLS bypass in verification)
    const serviceClient = await createServiceClient()
    const { data: conv } = await serviceClient
      .from('conversations')
      .select('session_id, phone_number_id, business_id')
      .eq('session_id', session_id)
      .eq('business_id', business_id)
      .single()

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found for this business' }, { status: 404 })
    }

    // 4. Fetch the business's phone_number_id
    const { data: business } = await serviceClient
      .from('businesses')
      .select('phone_number_id, name, is_active')
      .eq('id', business_id)
      .single()

    if (!business?.is_active) {
      return NextResponse.json({ error: 'Business WhatsApp connection is not active' }, { status: 400 })
    }

    if (!business.phone_number_id) {
      return NextResponse.json({ error: 'Business has no WhatsApp phone number configured' }, { status: 400 })
    }

    // 5. Send via n8n webhook (server-to-server, credentials never reach browser)
    const webhookUrl = process.env.N8N_MANUAL_REPLY_WEBHOOK_URL
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET

    if (!webhookUrl) {
      // Graceful degradation: log and return error if webhook not configured
      console.error('[send] N8N_MANUAL_REPLY_WEBHOOK_URL not configured')
      return NextResponse.json({
        error: 'Manual reply webhook not configured. Please set N8N_MANUAL_REPLY_WEBHOOK_URL.',
      }, { status: 503 })
    }

    let sendSuccess = false
    let providerMessageId: string | null = null
    let sendError: string | null = null

    try {
      const n8nRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
        },
        body: JSON.stringify({
          phone_number_id: business.phone_number_id,
          customer_phone,
          message: message.trim(),
          session_id,
          business_id,
          agent_id: user.id,
          is_manual_reply: true,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(15000), // 15s timeout
      })

      if (n8nRes.ok) {
        const n8nData = await n8nRes.json().catch(() => ({}))
        sendSuccess = true
        providerMessageId = n8nData?.messages?.[0]?.id ?? null
      } else {
        const errBody = await n8nRes.text().catch(() => '')
        sendError = `WhatsApp API error ${n8nRes.status}: ${errBody.slice(0, 200)}`
      }
    } catch (err: any) {
      sendError = err?.message?.includes('TimeoutError')
        ? 'Send request timed out — message delivery uncertain'
        : `Network error: ${err.message}`
    }

    // 6. Save to wa_messages regardless of send status
    const now = new Date().toISOString()
    const messageRecord = {
      wa_message_id: providerMessageId ?? `manual_${Date.now()}`,
      message_id: providerMessageId ?? `manual_${Date.now()}`,
      direction: 'outbound' as const,
      session_id,
      business_id,
      phone_number_id: business.phone_number_id,
      customer_phone,
      body: message.trim(),
      status: sendSuccess ? 'sent' : 'failed',
      agent_id: user.id,
      is_manual_reply: true,
      message_timestamp: now,
      created_at: now,
      metadata: {
        agent_id: user.id,
        business_name: business.name,
        send_error: sendError,
        provider_message_id: providerMessageId,
        is_manual_reply: true,
      },
    }

    const { error: insertError } = await serviceClient
      .from('wa_messages')
      .insert(messageRecord)

    if (insertError) {
      console.error('[send] Failed to save message:', insertError)
    }

    // 7. Write audit log
    await serviceClient.from('audit_log').insert({
      business_id,
      actor_id: user.id,
      action: 'manual_reply',
      target_type: 'conversation',
      target_id: session_id,
      metadata: {
        customer_phone,
        send_success: sendSuccess,
        message_length: message.trim().length,
        error: sendError,
      },
    })

    if (!sendSuccess) {
      return NextResponse.json({ error: sendError || 'Failed to send message' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message_id: providerMessageId })

  } catch (err: any) {
    console.error('[send] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
