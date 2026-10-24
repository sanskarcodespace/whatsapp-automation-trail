import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess, isRecord } from '@/lib/business-access'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => null)
    if (!isRecord(body) || typeof body.business_id !== 'string') return NextResponse.json({ error: 'Select a client' }, { status: 400 })
    const serviceClient = await createServiceClient()
    const access = await getBusinessAccess(serviceClient, user.id)
    if (!access.canManage(body.business_id)) return NextResponse.json({ error: 'Owner or manager access required' }, { status: 403 })
    const { data: business, error: readError } = await serviceClient.from('businesses').select('phone_number_id, waba_id').eq('id', body.business_id).single()
    if (readError || !business || !/^[0-9]{6,30}$/.test(business.phone_number_id ?? '') || !/^[0-9]{6,30}$/.test(business.waba_id ?? '')) {
      return NextResponse.json({ error: 'A valid Meta phone number ID and WABA ID are required' }, { status: 400 })
    }
    const token = process.env.WHATSAPP_SHARED_ACCESS_TOKEN
    const appId = process.env.WHATSAPP_APP_ID
    const version = process.env.WHATSAPP_GRAPH_VERSION
    if (!token || !appId || !version || !/^v[0-9]+\.[0-9]+$/.test(version)) {
      return NextResponse.json({ error: 'One-time server setup required: configure WHATSAPP_SHARED_ACCESS_TOKEN, WHATSAPP_APP_ID and WHATSAPP_GRAPH_VERSION to match the shared n8n WhatsApp credential. Never paste tokens into chat.' }, { status: 503 })
    }
    async function graph(resource: string) {
      const response = await fetch(`https://graph.facebook.com/${version}/${resource}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('Meta could not verify this connection. Check token permissions and the client’s authorization in Meta.')
      const result: unknown = await response.json()
      if (!isRecord(result) || result.error) throw new Error('Meta returned an invalid connection response')
      return result
    }
    async function findInEdge(edge: string, matches: (row: Record<string, unknown>) => boolean) {
      let cursor = ''
      for (let page = 0; page < 20; page += 1) {
        const result = await graph(`${business!.waba_id}/${edge}?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`)
        if (!Array.isArray(result.data)) return false
        if (result.data.some(row => isRecord(row) && matches(row))) return true
        const paging = isRecord(result.paging) ? result.paging : {}
        const cursors = isRecord(paging.cursors) ? paging.cursors : {}
        if (!paging.next || typeof cursors.after !== 'string' || cursors.after === cursor) return false
        cursor = cursors.after
      }
      return false
    }
    const phoneBelongs = await findInEdge('phone_numbers', row => row.id === business.phone_number_id)
    if (!phoneBelongs) return NextResponse.json({ error: 'This phone number is not accessible under the selected WABA' }, { status: 409 })
    const subscribed = await findInEdge('subscribed_apps', row => isRecord(row.whatsapp_business_api_data) && row.whatsapp_business_api_data.id === appId)
    if (!subscribed) return NextResponse.json({ error: 'The client’s WABA is not subscribed to your shared Meta app. Complete Meta onboarding first.' }, { status: 409 })
    const phone = await graph(`${business.phone_number_id}?fields=id,platform_type,status`)
    if (phone.id !== business.phone_number_id || phone.platform_type !== 'CLOUD_API' || phone.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Meta has not reported this number as CONNECTED to Cloud API. Complete phone registration first.' }, { status: 409 })
    }
    const { error } = await serviceClient.rpc('crm_record_connection_check', {
      p_actor_id: user.id, p_business_id: body.business_id, p_phone_number_id: business.phone_number_id!, p_waba_id: business.waba_id!,
    })
    if (error) return NextResponse.json({ error: 'Connection changed during verification, or migration 006 is not deployed. Refresh and retry.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unable to verify with Meta. Check the server credential, app subscription and phone registration; no activation was performed.' }, { status: 502 })
  }
}
