import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    const format = searchParams.get('format') ?? 'csv'
    const days = parseInt(searchParams.get('days') ?? '30', 10)
    const direction = searchParams.get('direction') // 'all' | 'inbound' | 'outbound'

    // Verify user membership
    const { data: membership } = await supabase
      .from('business_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('business_id', business_id || '')
      .single()

    if (!membership && business_id !== 'all') {
      return NextResponse.json({ error: 'Access denied to this business' }, { status: 403 })
    }

    const serviceClient = await createServiceClient()
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    let query = serviceClient
      .from('wa_messages')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (business_id && business_id !== 'all') {
      // Find phone_number_id for this business to filter
      const { data: bRow } = await serviceClient
        .from('businesses')
        .select('phone_number_id')
        .eq('id', business_id)
        .single()
      if (bRow?.phone_number_id) {
        query = query.eq('phone_number_id', bRow.phone_number_id)
      }
    }

    if (direction && (direction === 'inbound' || direction === 'outbound')) {
      query = query.eq('direction', direction)
    }

    const { data: messages, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (format === 'json') {
      return new NextResponse(JSON.stringify(messages, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="whatsapp_chat_export_${Date.now()}.json"`,
        },
      })
    }

    // Generate CSV with UTF-8 BOM so Hindi/Hinglish/emojis are preserved in Excel
    const BOM = '\uFEFF'
    const headers = [
      'Message ID',
      'Session ID',
      'Timestamp',
      'Direction',
      'Customer Phone',
      'Customer Name',
      'Message Body',
      'Status',
      'Intent',
      'Lead Status',
      'Manual Reply',
      'Business ID'
    ]

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = (messages ?? []).map((msg: any) => {
      const meta = typeof msg.metadata === 'object' && msg.metadata ? msg.metadata : {}
      const intent = msg.intent || meta.intent || ''
      const leadStatus = msg.lead_status || meta.lead_status || ''
      const bizId = msg.business_id || meta.business_id || business_id || ''

      return [
        escapeCsv(msg.wa_message_id || msg.message_id),
        escapeCsv(msg.session_id),
        escapeCsv(msg.message_timestamp || msg.created_at),
        escapeCsv(msg.direction),
        escapeCsv(msg.customer_phone),
        escapeCsv(msg.customer_name),
        escapeCsv(msg.body || msg.message_text),
        escapeCsv(msg.status),
        escapeCsv(intent),
        escapeCsv(leadStatus),
        escapeCsv(msg.is_manual_reply ? 'Yes' : 'No'),
        escapeCsv(bizId),
      ].join(',')
    })

    const csvContent = BOM + headers.join(',') + '\n' + rows.join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="whatsapp_chat_export_${Date.now()}.csv"`,
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
