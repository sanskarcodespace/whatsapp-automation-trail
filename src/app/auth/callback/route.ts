import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/business-access'

export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const service = await createServiceClient()
        const { error: claimError } = await service.rpc('crm_accept_client_invites', { p_user_id: user.id })
        if (claimError) return NextResponse.redirect(new URL('/access', request.url))
        const access = await getBusinessAccess(service, user.id)
        return NextResponse.redirect(new URL(access.canProvision ? '/admin' : access.businessIds.length ? '/' : '/access', request.url))
      }
    }
  }
  return NextResponse.redirect(new URL('/login?verification=failed', request.url))
}
