const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadModule(relativePath, dependencies, globals = {}) {
  const filename = path.join(root, relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    URL, Response, Date, AbortSignal, crypto: require('node:crypto').webcrypto,
    console, ...globals,
  }, { filename })
  return module.exports
}

function setup({ role = 'owner', membership = true, authenticated = true, provider = { messages: [{ id: 'wamid.sent' }] }, rows = {}, env = {}, graphResponse } = {}) {
  const database = {
    business_members: membership ? [{ user_id: 'user-a', business_id: 'biz-a', role }] : [],
    conversations: [{ session_id: 'session-a', business_id: 'biz-a', customer_phone: '919876543210', phone_number_id: 'phone-a', human_takeover: false, last_inbound_at: new Date().toISOString() }],
    businesses: [{ id: 'biz-a', phone_number_id: 'phone-a', name: 'Tenant A', is_active: true, settings: { catalog_key: 'amolik', api_secret: 'private-server-value' } }],
    wa_messages: [
      { id: 'a', session_id: 'shared-session', business_id: 'biz-a', body: 'Tenant A', created_at: new Date().toISOString() },
      { id: 'b', session_id: 'shared-session', business_id: 'biz-b', body: 'Tenant B', created_at: new Date().toISOString() },
    ],
    audit_log: [], response_style_profiles: [], ...rows,
  }
  const calls = []
  const sends = []
  const client = {
    async rpc(name, args) {
      calls.push({ rpc: name, args })
      if (name === 'crm_save_ai_settings') {
        const business = database.businesses.find(row => row.id === args.p_business_id)
        business.settings = { ...business.settings, ...args.p_settings }
        for (const [key, value] of Object.entries(args.p_settings)) if (typeof value === 'string') business[key] = value
        if (args.p_system_prompt !== undefined) business.system_prompt = args.p_system_prompt
        if (args.p_style) database.response_style_profiles.push({ business_id: args.p_business_id, approved: true, ...args.p_style })
        return { data: business.settings, error: null }
      }
      if (name === 'crm_manage_client') return { data: { id: args.p_business_id || 'new-client' }, error: null }
      if (name === 'crm_record_connection_check') return { data: true, error: null }
      throw new Error(`Unexpected RPC: ${name}`)
    },
    from(table) {
      const filters = []
      let action = null
      let payload
      let single = false
      let maximum = Infinity
      let columns = '*'
      let sort
      const query = {
        select(value = '*') { columns = value; return query },
        eq(key, value) { filters.push(record => record[key] === value); return query },
        in(key, values) { filters.push(record => values.includes(record[key])); return query },
        gte(key, value) { filters.push(record => record[key] >= value); return query },
        order(key, options) { sort = { key, ...options }; return query },
        limit(value) { maximum = value; return query },
        update(value) { action = 'update'; payload = value; return query },
        insert(value) { action = 'insert'; payload = value; return query },
        upsert(value) { action = 'insert'; payload = value; return query },
        single() { single = true; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          try {
            calls.push({ table, action, payload })
            let records = (database[table] ?? []).filter(record => filters.every(filter => filter(record)))
            if (action === 'update') records.forEach(record => Object.assign(record, payload))
            if (action === 'insert') {
              const inserts = Array.isArray(payload) ? payload : [payload]
              database[table].push(...inserts)
              records = inserts
            }
            if (sort) records = [...records].sort((first, second) =>
              String(first[sort.key]).localeCompare(String(second[sort.key])) * (sort.ascending ? 1 : -1))
            records = records.slice(0, maximum)
            if (columns !== '*') records = records.map(record => Object.fromEntries(columns.split(',').map(column => [column.trim(), record[column.trim()]])))
            resolve({ data: single ? records[0] ?? null : records, error: null })
          } catch (error) { reject(error) }
        },
      }
      return query
    },
  }
  const access = loadModule('src/lib/business-access.ts', {})
  const server = {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user-a' } : null }, error: null }) } }),
    createServiceClient: async () => client,
  }
  function route(name) {
    return loadModule(`src/app/api/${name}/route.ts`, {
      'next/server': { NextResponse: Response },
      '@/lib/business-access': access,
      '@/lib/supabase/server': server,
    }, {
      process: { env: { N8N_MANUAL_REPLY_WEBHOOK_URL: 'https://example.invalid/manual', N8N_WEBHOOK_SECRET: 'test-secret', ...env } },
      fetch: async (url, options) => {
        if (graphResponse) return graphResponse(url, options)
        assert.equal(database.conversations[0].human_takeover, true)
        sends.push({ url, options, body: JSON.parse(options.body) })
        return Response.json(provider)
      },
    })
  }
  function page(name) {
    const components = Object.fromEntries(['layout/Sidebar', 'ai/AISettingsClient', 'settings/SettingsClient', 'inbox/InboxClient', 'contacts/ContactsClient', 'appointments/AppointmentsClient', 'leads/LeadsClient', 'export/ExportClient']
      .map(component => [`@/components/${component}`, { [component.split('/')[1]]: component }]))
    const render = (type, props) => ({ type, props })
    return loadModule(`src/app/(dashboard)/${name}.tsx`, {
      ...components,
      '@/lib/supabase/server': server,
      '@/lib/business-access': access,
      'react/jsx-runtime': { jsx: render, jsxs: render },
      'next/navigation': { redirect: location => { throw new Error(`redirect:${location}`) } },
      'lucide-react': {},
    }).default
  }
  return { database, calls, sends, route, page }
}

function request(body) {
  return new Request('https://example.invalid/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
}

test('messages require tenant membership even when the session ID is shared', async () => {
  const context = setup()
  const response = await context.route('messages').GET(new Request('https://example.invalid/api/messages?business_id=biz-a&session_id=shared-session'))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).messages.map(message => message.id), ['a'])
  const denied = await context.route('messages').GET(new Request('https://example.invalid/api/messages?business_id=biz-b&session_id=shared-session'))
  assert.equal(denied.status, 403)
})

test('every API rejects unauthenticated callers before database access', async () => {
  const context = setup({ authenticated: false })
  for (const name of ['messages', 'export']) {
    assert.equal((await context.route(name).GET(new Request('https://example.invalid/api'))).status, 401)
  }
  for (const name of ['conversations/toggle-ai', 'business/ai-settings', 'business/clients', 'business/connection', 'messages/send']) {
    assert.equal((await context.route(name).POST(request({}))).status, 401)
  }
  assert.equal(context.calls.length, 0)
})

test('unassigned accounts cannot read tenant data or auto-create admin memberships through dashboard pages', async () => {
  const context = setup({ membership: false })
  for (const name of ['layout', 'page', 'ai/page', 'settings/page', 'inbox/page', 'contacts/page', 'appointments/page', 'leads/page', 'export/page']) {
    await context.page(name)({ children: null })
  }
  assert.equal(context.calls.some(call => call.action), false)
  assert.equal(context.calls.some(call => call.table === 'businesses'), false)
  assert.equal(context.database.business_members.length, 0)
})

test('dashboard client props exclude business credentials and private settings', async () => {
  const context = setup()
  context.database.businesses[0].whatsapp_access_token_enc = 'private-whatsapp-token'
  for (const name of ['layout', 'ai/page', 'settings/page']) {
    const rendered = JSON.stringify(await context.page(name)({ children: null }))
    assert.doesNotMatch(rendered, /private-whatsapp-token|private-server-value/)
  }
})

test('platform admin membership remains scoped to its own business', async () => {
  const context = setup({ role: 'platform_admin' })
  const response = await context.route('messages').GET(new Request('https://example.invalid/api/messages?business_id=biz-b&session_id=shared-session'))
  assert.equal(response.status, 403)
})

test('message history returns the newest 200 records in chronological order', async () => {
  const messages = Array.from({ length: 205 }, (_, index) => ({ id: String(index), session_id: 'session-a', business_id: 'biz-a', created_at: new Date(1700000000000 + index * 1000).toISOString() }))
  const context = setup({ rows: { wa_messages: messages } })
  const response = await context.route('messages').GET(new Request('https://example.invalid/api/messages?business_id=biz-a&session_id=session-a'))
  const payload = await response.json()
  assert.equal(payload.messages.length, 200)
  assert.equal(payload.messages[0].id, '5')
  assert.equal(payload.messages[199].id, '204')
})

test('takeover rejects foreign tenants and string booleans before mutation', async () => {
  const context = setup()
  const handler = context.route('conversations/toggle-ai').POST
  assert.equal((await handler(request({ business_id: 'biz-b', session_id: 'session-a', human_takeover: true }))).status, 403)
  assert.equal((await handler(request({ business_id: 'biz-a', session_id: 'session-a', human_takeover: 'false' }))).status, 400)
  assert.equal(context.calls.some(call => call.action === 'update'), false)
  assert.equal((await handler(request({ business_id: 'biz-a', session_id: 'session-a', human_takeover: true }))).status, 200)
  assert.equal(context.database.conversations[0].status, 'human')
})

test('all-business export only includes memberships and rejects invalid limits', async () => {
  const context = setup({ role: 'platform_admin' })
  const handler = context.route('export').GET
  const response = await handler(new Request('https://example.invalid/api/export?business_id=all&format=json'))
  assert.deepEqual((await response.json()).map(message => message.id), ['a'])
  assert.equal((await handler(new Request('https://example.invalid/api/export?business_id=all&days=-1'))).status, 400)
  const unassigned = setup({ membership: false })
  assert.equal((await unassigned.route('export').GET(new Request('https://example.invalid/api/export?business_id=all'))).status, 403)
})

test('CSV export escapes customer formulas', async () => {
  const context = setup()
  context.database.wa_messages[0].body = '=HYPERLINK("https://example.invalid")'
  const response = await context.route('export').GET(new Request('https://example.invalid/api/export?business_id=biz-a'))
  assert.match(await response.text(), /'=HYPERLINK/)
})

test('AI configuration requires a manager and rejects server-only settings', async () => {
  const agent = setup({ role: 'agent' })
  assert.equal((await agent.route('business/ai-settings').POST(request({ business_id: 'biz-a', system_prompt: 'New prompt' }))).status, 403)
  const context = setup()
  const handler = context.route('business/ai-settings').POST
  assert.equal((await handler(request({ business_id: 'biz-b', system_prompt: 'New prompt' }))).status, 403)
  assert.equal((await handler(request({ business_id: 'biz-a', settings: { catalog_key: 'other' } }))).status, 400)
  const response = await handler(request({ business_id: 'biz-a', settings: { services: 'Updated catalog' } }))
  assert.equal(response.status, 200)
  assert.equal(context.database.businesses[0].services, 'Updated catalog')
  assert.equal(context.database.businesses[0].settings.catalog_key, 'amolik')
  assert.deepEqual((await response.json()).settings, { services: 'Updated catalog' })
})

test('catalog input is validated and public settings never expose unknown fields', async () => {
  const context = setup()
  const handler = context.route('business/ai-settings').POST
  const project = { id: 'tower', name: 'Tower A', configurations: [{ bhk: 2, price: '₹50 lakh' }] }
  for (const catalog of [{ projects: 'bad' }, { projects: [project, project] }, { projects: [{ ...project, secret: 'private' }] }, { projects: [{ ...project, configurations: [{ bhk: 10, price: 'Bad' }] }] }]) {
    assert.equal((await handler(request({ business_id: 'biz-a', settings: { catalog } }))).status, 400)
  }
  assert.equal((await handler(request({ business_id: 'biz-a', settings: { owner_phone: 'not-a-phone' } }))).status, 400)
  const response = await handler(request({ business_id: 'biz-a', settings: { catalog: { projects: [project] }, owner_phone: '919123456789', greeting_en: 'Hi from our team!' }, style: { style_notes: 'Warm' } }))
  assert.equal(response.status, 200)
  assert.doesNotMatch(JSON.stringify(await response.json()), /private-server-value|catalog_key/)
  assert.equal(context.calls.filter(call => call.rpc === 'crm_save_ai_settings').length, 1)
})

test('client creation is operator-only, starts paused and rejects forged connection state', async () => {
  const payload = { name: 'Tenant C', phone_number_id: '123456789', waba_id: '987654321' }
  for (const role of ['owner', 'manager', 'agent']) {
    const context = setup({ role })
    assert.equal((await context.route('business/clients').POST(request(payload))).status, 403)
    assert.equal(context.calls.some(call => call.rpc), false)
  }
  const context = setup({ role: 'platform_admin' })
  assert.equal((await context.route('business/clients').POST(request({ ...payload, is_active: true }))).status, 400)
  assert.equal((await context.route('business/clients').POST(request({ ...payload, connection_status: 'connected' }))).status, 400)
  assert.equal((await context.route('business/clients').POST(request(payload))).status, 200)
  assert.equal(context.calls.at(-1).args.p_actor_id, 'user-a')
})

test('client updates and team assignments enforce scoped roles and forbid operator escalation', async () => {
  const context = setup({ role: 'platform_admin' })
  const handler = context.route('business/clients')
  assert.equal((await handler.PATCH(request({ business_id: 'biz-b', name: 'Foreign' }))).status, 403)
  assert.equal((await handler.PUT(request({ business_id: 'biz-a', email: 'member@example.invalid', role: 'platform_admin' }))).status, 400)
  assert.equal((await handler.PUT(request({ business_id: 'biz-a', email: 'member@example.invalid', role: 'agent' }))).status, 200)
  assert.equal((await handler.PATCH(request({ business_id: 'biz-a', is_active: 'false' }))).status, 400)
  const manager = setup({ role: 'manager' })
  assert.equal((await manager.route('business/clients').PUT(request({ business_id: 'biz-a', email: 'member@example.invalid', role: 'agent' }))).status, 403)
  assert.equal((await manager.route('business/clients').PATCH(request({ business_id: 'biz-a', is_active: false }))).status, 200)
})

test('AI editing rights follow each client membership, not the first membership', async () => {
  const context = setup({ rows: {
    business_members: [{ user_id: 'user-a', business_id: 'biz-a', role: 'owner' }, { user_id: 'user-a', business_id: 'biz-b', role: 'agent' }],
    businesses: [{ id: 'biz-a', settings: {} }, { id: 'biz-b', settings: {} }],
  } })
  const rendered = await context.page('ai/page')({ searchParams: Promise.resolve({ business: 'biz-b' }) })
  assert.equal(rendered.props.businesses[0].id, 'biz-b')
  assert.equal(JSON.stringify(rendered.props.manageableBusinessIds), '["biz-a"]')
  assert.equal((await context.route('business/ai-settings').POST(request({ business_id: 'biz-b', settings: { faqs: 'Forged change' } }))).status, 403)
})

test('connection verification requires server credentials, correct WABA, subscription and registered phone', async () => {
  const rows = { businesses: [{ id: 'biz-a', phone_number_id: '123456789', waba_id: '987654321' }] }
  const missing = setup({ rows })
  assert.equal((await missing.route('business/connection').POST(request({ business_id: 'biz-a' }))).status, 503)
  const env = { WHATSAPP_SHARED_ACCESS_TOKEN: 'server-only-token', WHATSAPP_APP_ID: 'app-123', WHATSAPP_GRAPH_VERSION: 'v99.0' }
  for (const fail of ['phone', 'app', 'registration', 'none']) {
    const context = setup({ rows, env, graphResponse: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer server-only-token')
      assert.equal(options.redirect, 'error')
      if (url.includes('/phone_numbers?')) return Response.json({ data: fail === 'phone' ? [] : [{ id: '123456789' }] })
      if (url.includes('/subscribed_apps?')) return Response.json({ data: [{ whatsapp_business_api_data: { id: fail === 'app' ? 'other-app' : 'app-123' } }] })
      return Response.json({ id: '123456789', platform_type: 'CLOUD_API', status: fail === 'registration' ? 'PENDING' : 'CONNECTED' })
    } })
    const response = await context.route('business/connection').POST(request({ business_id: 'biz-a' }))
    assert.equal(response.status, fail === 'none' ? 200 : 409, fail)
    assert.equal(context.calls.some(call => call.rpc === 'crm_record_connection_check'), fail === 'none')
    assert.doesNotMatch(JSON.stringify(await response.json()), /server-only-token/)
  }
})

test('manual reply refuses a substituted recipient', async () => {
  const context = setup()
  const response = await context.route('messages/send').POST(request({ business_id: 'biz-a', session_id: 'session-a', customer_phone: '911111111111', message: 'Hello' }))
  assert.equal(response.status, 400)
  assert.equal(context.sends.length, 0)
})

test('manual reply pauses AI and persists the tenant and confirmed provider ID', async () => {
  const context = setup()
  const response = await context.route('messages/send').POST(request({ business_id: 'biz-a', session_id: 'session-a', message: 'Hello' }))
  assert.equal(response.status, 200)
  assert.equal(context.sends[0].body.customer_phone, '919876543210')
  const saved = context.database.wa_messages.find(message => message.wa_message_id === 'wamid.sent')
  assert.equal(saved.business_id, 'biz-a')
  assert.equal(saved.status, 'sent')
  assert.equal(context.sends[0].options.headers['X-Webhook-Secret'], 'test-secret')
})

test('an asynchronous webhook acknowledgment is not proof of message acceptance', async () => {
  const context = setup({ provider: { message: 'Workflow started' } })
  const response = await context.route('messages/send').POST(request({ business_id: 'biz-a', session_id: 'session-a', message: 'Hello' }))
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /uncertain/)
  assert.equal(context.database.wa_messages.at(-1).status, 'failed')
})

test('manual free-text replies refuse an expired WhatsApp reply window', async () => {
  const context = setup()
  context.database.conversations[0].last_inbound_at = new Date(Date.now() - 25 * 3600000).toISOString()
  const response = await context.route('messages/send').POST(request({ business_id: 'biz-a', session_id: 'session-a', message: 'Hello' }))
  assert.equal(response.status, 409)
  assert.equal(context.sends.length, 0)
})
