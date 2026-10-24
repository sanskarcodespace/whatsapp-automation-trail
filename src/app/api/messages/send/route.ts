import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord } from '@/lib/business-access'

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

    const body = await req.json().catch(() => null)
    if (!isRecord(body) || typeof body.session_id !== 'string' || !body.session_id ||
      typeof body.business_id !== 'string' || !body.business_id || typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const { session_id, business_id, message } = body

    if (message.trim().length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 characters)' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    const access = await getBusinessAccess(serviceClient, user.id)
    if (!access.canAccess(business_id)) {
      return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 })
    }

    // 3. Verify conversation belongs to this business (using service client for RLS bypass in verification)
    const { data: conv } = await serviceClient
      .from('conversations')
      .select('session_id, phone_number_id, business_id, customer_phone, last_inbound_at')
      .eq('session_id', session_id)
      .eq('business_id', business_id)
      .single()

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found for this business' }, { status: 404 })
    }
    const customer_phone = conv.customer_phone
    if (!customer_phone || !/^\+?\d{7,15}$/.test(customer_phone) ||
      (body.customer_phone !== undefined && body.customer_phone !== customer_phone)) {
      return NextResponse.json({ error: 'Recipient does not match the conversation' }, { status: 400 })
    }
    const lastInbound = conv.last_inbound_at ? Date.parse(conv.last_inbound_at) : NaN
    if (!Number.isFinite(lastInbound) || Date.now() - lastInbound >= 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'The WhatsApp reply window is closed. An approved template is required.' }, { status: 409 })
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

    if (!business.phone_number_id || conv.phone_number_id !== business.phone_number_id) {
      return NextResponse.json({ error: 'Business has no WhatsApp phone number configured' }, { status: 400 })
    }

    // 5. Send via n8n webhook (server-to-server, credentials never reach browser)
    const webhookUrl = process.env.N8N_MANUAL_REPLY_WEBHOOK_URL
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET

    if (!webhookUrl || !webhookSecret) {
      // Graceful degradation: log and return error if webhook not configured
      console.error('[send] N8N_MANUAL_REPLY_WEBHOOK_URL not configured')
      return NextResponse.json({
        error: 'Manual reply webhook URL and secret must be configured.',
      }, { status: 503 })
    }
    const { error: takeoverError } = await serviceClient.from('conversations')
      .update({ human_takeover: true, status: 'human', updated_at: new Date().toISOString() })
      .eq('business_id', business_id)
      .eq('session_id', session_id)
    if (takeoverError) return NextResponse.json({ error: 'Unable to pause AI before manual reply' }, { status: 500 })

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
        signal: AbortSignal.timeout(15000),
      })

      if (n8nRes.ok) {
        const n8nData = await n8nRes.json().catch(() => ({}))
        providerMessageId = typeof n8nData?.messages?.[0]?.id === 'string' ? n8nData.messages[0].id : null
        sendSuccess = Boolean(providerMessageId)
        if (!sendSuccess) sendError = 'Webhook did not confirm WhatsApp acceptance; delivery is uncertain'
      } else {
        sendError = `WhatsApp delivery failed (webhook status ${n8nRes.status})`
      }
    } catch (err) {
      sendError = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? 'Send request timed out — message delivery uncertain'
        : 'Network error — message delivery uncertain'
    }

    // 6. Save to wa_messages regardless of send status
    const now = new Date().toISOString()
    const messageId = providerMessageId ?? `manual_${crypto.randomUUID()}`
    const messageRecord = {
      wa_message_id: messageId,
      message_id: messageId,
      business_id,
      direction: 'outbound' as const,
      session_id,
      phone_number_id: business.phone_number_id,
      customer_phone,
      body: message.trim(),
      status: sendSuccess ? 'sent' : 'failed',
      agent_id: user.id,
      is_manual_reply: true,
      message_timestamp: now,
      created_at: now,
      metadata: {
        business_id,
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
      return NextResponse.json({
        success: sendSuccess,
        message_id: providerMessageId,
        error: sendSuccess ? 'Message sent, but history could not be saved. Do not resend.' : 'Delivery uncertain and history could not be saved. Check WhatsApp before retrying.',
      }, { status: sendSuccess ? 200 : 502 })
    }

    // 7. Update conversation state: update last_message, reset unread_count, preserve AI state
    if (sendSuccess) await serviceClient
      .from('conversations')
      .update({
        last_message_at: now,
        unread_count: 0,
        updated_at: now,
      })
      .eq('business_id', business_id)
      .eq('session_id', session_id)

    // 8. Write audit log
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

  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
