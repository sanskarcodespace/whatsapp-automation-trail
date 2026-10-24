const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runAsync = promisify(execFile);
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@14/bin';
const businessA = '11111111-1111-4111-8111-111111111111';
const businessB = '22222222-2222-4222-8222-222222222222';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-queue-tests-'));
const dataDirectory = path.join(directory, 'data');
const port = '56497';
const args = ['-h', directory, '-p', port, '-U', os.userInfo().username, '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
let started = false;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = statement => execFileSync(path.join(bin, 'psql'), [...args, '-c', statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const json = statement => JSON.parse(sql(statement));
const ingest = (id, body = '.', business = businessA, phone = 'phone-a', customer = '919111111111', quotedId = null) => json(`select ingest_inbound_message(${quote(business)},${quote(phone)},${quote(customer)},${quote(id)},${quote(body)},'Rahul',${quotedId ? quote(quotedId) : 'null'},clock_timestamp());`);
const age = () => sql('select pg_sleep(2.05)');
const claim = (business = businessA, session = 'phone-a:919111111111') => json(`select claim_inbound_batch(${quote(business)},${quote(session)});`);
const batchArgs = batch => [batch.business_id, batch.batch_id, batch.claim_token].map(quote).join(',');
const finish = batch => json(`select finish_inbound_batch(${batchArgs(batch)});`);
const save = (batch, overrides = {}) => json(`select persist_batch_result(${batchArgs(batch)},${quote(JSON.stringify({ reply_text_1: 'Hello', reply_text_2: '', lead_payload: { preferred_bhk: '2 BHK', budget: '70 lakh', status: 'qualified' }, ...overrides }))}::jsonb);`);

before(() => {
  execFileSync(path.join(bin, 'initdb'), ['-D', dataDirectory, '-A', 'trust', '--no-locale'], { stdio: 'pipe' });
  execFileSync(path.join(bin, 'pg_ctl'), ['-D', dataDirectory, '-l', path.join(directory, 'postgres.log'), '-o', `-k ${directory} -p ${port} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  for (const filename of ['tests/database-fixture.sql', 'migrations/003_durable_tenant_queue.sql', 'migrations/003_durable_tenant_queue.sql', 'migrations/005_lead_stage_compatibility.sql', 'migrations/005_lead_stage_compatibility.sql', 'migrations/006_crm_client_control.sql', 'migrations/006_crm_client_control.sql']) {
    execFileSync(path.join(bin, 'psql'), [...args, '-f', path.join(__dirname, '..', filename)], { stdio: 'pipe' });
  }
  sql(`insert into businesses(id,name,phone_number_id,is_active,settings) values (${quote(businessA)},'Amolik Group','phone-a',true,'{"catalog_key":"amolik"}'),(${quote(businessB)},'Tenant B','phone-b',true,'{}'); insert into auth.users values ('00000000-0000-0000-0000-000000000001','a@example.invalid'),('00000000-0000-0000-0000-000000000002','b@example.invalid'); insert into business_members(business_id,user_id,role) values (${quote(businessA)},'00000000-0000-0000-0000-000000000001','platform_admin'),(${quote(businessB)},'00000000-0000-0000-0000-000000000002','owner');`);
});

after(() => {
  if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', dataDirectory, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('durable ingest deduplicates and resolves only the matching active tenant', () => {
  assert.equal(ingest('one', '3 BHK').accepted, true);
  assert.equal(ingest('one', 'duplicate').duplicate, true);
  assert.equal(ingest('one', 'Other tenant', businessB, 'phone-b').accepted, true);
  assert.throws(() => ingest('wrong', 'private', businessB, 'phone-a'), /Unknown, inactive or ambiguous/);
  assert.equal(sql(`select count(*) from wa_messages where business_id=${quote(businessA)} and message_id='one'`), '1');
  assert.equal(claim().reason, 'quiet_window_not_elapsed');
});

test('unknown business events are quarantined without stopping other webhook items', () => {
  const result = json("select ingest_inbound_message(null,'unknown-phone','919111111111','unknown-event','.');");
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'unknown_or_inactive_business');
  assert.equal(sql("select count(*) from unknown_messages where message_id='unknown-event'"), '1');
});

test('legacy writer messages get tenant identity and cannot replay into the new queue', () => {
  sql("insert into wa_messages(phone_number_id,customer_phone,message_id,body) values ('phone-a','919111111111','legacy-sent','Hello')");
  assert.equal(ingest('legacy-sent').duplicate, true);
  assert.equal(sql("select count(*) from inbound_message_buffer where message_id='legacy-sent'"), '0');
  assert.equal(sql("select count(*) from wa_messages where message_id='legacy-sent' and business_id is not null and session_id='phone-a:919111111111'"), '1');
});

test('parallel claimers yield one chronological batch, and new messages stay in the next turn', async () => {
  ingest('two', 'Amolik Park'); ingest('three', 'Budget 70 lakh'); age();
  const outputs = await Promise.all(Array.from({ length: 6 }, () => runAsync(path.join(bin, 'psql'), [...args, '-c', `select claim_inbound_batch(${quote(businessA)},'phone-a:919111111111');`])));
  const claims = outputs.map(output => JSON.parse(output.stdout));
  const winners = claims.filter(result => result.should_process);
  assert.equal(winners.length, 1);
  const batch = winners[0];
  assert.deepEqual(batch.messages.map(message => message.body), ['3 BHK', 'Amolik Park', 'Budget 70 lakh']);
  ingest('four', 'Ready to move'); age();
  assert.equal(claim().reason, 'session_busy');
  assert.equal(finish(batch).pending_count, 1);
  const next = claim();
  assert.deepEqual(next.message_ids, ['four']);
  finish(next);
});

test('expired claims recover the same saved batch and reject stale fencing tokens', () => {
  ingest('retry', '2 bh chahiye'); age();
  const first = claim(); save(first);
  sql(`update inbound_batches set lease_expires_at=clock_timestamp()-interval '1 second' where id=${quote(first.batch_id)}`);
  const second = claim();
  assert.equal(second.batch_id, first.batch_id);
  assert.notEqual(second.claim_token, first.claim_token);
  assert.equal(second.saved_result.lead_payload.preferred_bhk, '2 BHK');
  assert.equal(json(`select renew_inbound_batch(${batchArgs(first)});`).renewed, false);
  finish(second);
});

test('quoted context is scoped and both successful bubble IDs are stored separately', () => {
  ingest('quoted-start', 'Amolik Heights'); age();
  const batch = claim(); save(batch, { reply_text_1: 'Amolik Heights 2 BHK', reply_text_2: 'Clubhouse and power backup' });
  for (const [part, id, body] of [['reply_1', 'out-first', 'Amolik Heights 2 BHK'], ['reply_2', 'out-second', 'Clubhouse and power backup']]) {
    assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},${quote(part)});`).allowed, true);
    assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},${quote(part)});`).allowed, true);
    sql(`select record_batch_delivery(${batchArgs(batch)},${quote(part)},${quote(id)},${quote(body)});`);
    assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},${quote(part)});`).allowed, false);
    assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},${quote(part)});`).reason, 'sent');
    sql(`select record_batch_delivery(${batchArgs(batch)},${quote(part)},${quote(id)},${quote(body)});`);
  }
  finish(batch);
  ingest('quote-followup', 'Price?', businessA, 'phone-a', '919111111111', 'out-first'); age();
  const next = claim();
  const context = json(`select workflow_context(${quote(businessA)},'phone-a:919111111111',array['quote-followup']);`);
  assert.equal(context.quoted_messages[0].body, 'Amolik Heights 2 BHK');
  assert.equal(context.history.filter(row => row.message_id === 'out-second').length, 1);
  assert.equal(json(`select workflow_context(${quote(businessB)},'phone-b:919111111111',array['quote-followup']);`).quoted_messages.length, 0);
  finish(next);
});

test('visit capture is idempotent; manual takeover blocks the next bubble immediately', () => {
  ingest('visit', 'Can I visit tomorrow?'); age(); const batch = claim();
  save(batch, { handoff: true, appointment_requested: true });
  save(batch, { handoff: true, appointment_requested: true });
  assert.equal(sql("select count(*) from appointment_requests where source_message_id='visit' and status='pending_human_confirmation'"), '1');
  assert.equal(json(`select renew_inbound_batch(${batchArgs(batch)});`).can_send, true);
  sql(`update conversations set human_takeover=true where business_id=${quote(businessA)}`);
  assert.equal(json(`select renew_inbound_batch(${batchArgs(batch)});`).can_send, false);
  assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},'reply_2');`).allowed, false);
  finish(batch);
});

test('unknown provider acceptance requires reconciliation instead of a duplicate retry', () => {
  sql(`update conversations set human_takeover=false where business_id=${quote(businessA)}`);
  ingest('ambiguous', 'Price'); age(); const batch = claim(); save(batch);
  assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},'reply_1');`).allowed, true);
  assert.equal(json(`select retry_inbound_batch(${batchArgs(batch)},'provider timeout');`).reason, 'needs_reconciliation');
  assert.equal(claim().reason, 'needs_reconciliation');
  assert.equal(sql(`select count(*) from workflow_errors where batch_id=${quote(batch.batch_id)}`), '1');
});

test('worker RPCs and tenant data cannot be read or written by anonymous or foreign clients', () => {
  assert.equal(sql("select has_function_privilege('anon','public.claim_inbound_batch(text,text,integer,integer)','EXECUTE')"), 'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.resolve_quoted_context(text,text)','EXECUTE')"), 'f');
  assert.equal(sql("select has_table_privilege('anon','inbound_message_buffer','SELECT')"), 'f');
  const scoped = sql("set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; select string_agg(id::text,',') from businesses;").split('\n').at(-1);
  assert.equal(scoped, businessA);
  assert.equal(sql("select has_column_privilege('authenticated','businesses','whatsapp_access_token_enc','SELECT')"), 'f');
  assert.equal(sql("select has_table_privilege('authenticated','business_members','INSERT')"), 'f');
});

test('legacy UUID conversation without a session is reused and populated when its customer returns', () => {
  const customer = '919222222222';
  const conversationId = sql(`insert into conversations (business_id, customer_phone, status)
    values (${quote(businessA)}, ${quote(customer)}, 'waiting') returning id;`).split('\n')[0];
  ingest('legacy-session', 'Please share details', businessA, 'phone-a', customer); age();
  const batch = claim(businessA, `phone-a:${customer}`);
  assert.equal(json(`select workflow_context(${quote(businessA)},${quote(`phone-a:${customer}`)},array['legacy-session']);`).conversation.id, conversationId);
  save(batch);
  assert.equal(sql(`select count(*) from conversations where business_id=${quote(businessA)} and customer_phone=${quote(customer)}`), '1');
  assert.equal(sql(`select session_id from conversations where id=${quote(conversationId)}`), `phone-a:${customer}`);
  assert.equal(sql(`select status from conversations where id=${quote(conversationId)}`), 'waiting');
  finish(batch);
});

test('new lead keeps the legacy default and an existing lead keeps its status without a supplied status', () => {
  const customer = '919333333333';
  ingest('default-lead', '2 bh', businessA, 'phone-a', customer); age();
  const first = claim(businessA, `phone-a:${customer}`);
  save(first, { lead_payload: { preferred_bhk: '2 BHK', budget: '65 lakh' } });
  assert.equal(sql(`select status from leads where business_id=${quote(businessA)} and customer_phone=${quote(customer)}`), 'new');
  finish(first);
  sql(`update leads set status='contacted' where business_id=${quote(businessA)} and customer_phone=${quote(customer)}`);
  ingest('preserve-lead', 'Sector 88', businessA, 'phone-a', customer); age();
  const second = claim(businessA, `phone-a:${customer}`);
  save(second, { lead_payload: { location: 'Sector 88' } });
  const lead = json(`select row_to_json(lead) from leads lead where business_id=${quote(businessA)} and customer_phone=${quote(customer)}`);
  assert.equal(lead.status, 'contacted');
  assert.equal(lead.budget, '65 lakh');
  assert.equal(lead.preferred_bhk, '2 BHK');
  assert.equal(lead.location, 'Sector 88');
  finish(second);
});

test('concurrent duplicate webhooks create one durable message and history insertion rolls back atomically', async () => {
  const command = `select ingest_inbound_message(null,'phone-a','919444444444','parallel-duplicate','.',
    'Rahul',null,clock_timestamp());`;
  const outputs = await Promise.all(Array.from({ length: 6 }, () => runAsync(path.join(bin, 'psql'), [...args, '-c', command])));
  assert.equal(outputs.map(output => JSON.parse(output.stdout)).filter(result => result.accepted).length, 1);
  assert.equal(sql("select count(*) from inbound_message_buffer where message_id='parallel-duplicate'"), '1');
  assert.equal(sql("select count(*) from wa_messages where message_id='parallel-duplicate'"), '1');
  sql(`create function reject_test_history() returns trigger language plpgsql as $$
    begin if new.message_id = 'failed-history' then raise exception 'test history failure'; end if; return new; end;
    $$; create trigger reject_test_history before insert on wa_messages for each row execute function reject_test_history();`);
  assert.throws(() => ingest('failed-history', 'Keep this atomic', businessA, 'phone-a', '919444444444'), /test history failure/);
  assert.equal(sql("select count(*) from inbound_message_buffer where message_id='failed-history'"), '0');
  sql('drop trigger reject_test_history on wa_messages; drop function reject_test_history();');
});

test('expired inbound events remain in history but never become sendable queue work', () => {
  const response = json(`select ingest_inbound_message(null,'phone-a','919555555555','old-webhook','Old question',
    'Rahul',null,clock_timestamp()-interval '25 hours');`);
  assert.equal(response.accepted, false);
  assert.equal(response.stored, true);
  assert.equal(response.reason, 'reply_window_expired');
  assert.equal(sql("select status from inbound_message_buffer where message_id='old-webhook'"), 'dropped');
  assert.equal(sql("select count(*) from wa_messages where message_id='old-webhook'"), '1');
  assert.equal(claim(businessA, 'phone-a:919555555555').reason, 'no_pending_messages');
  ingest('current-window', 'Hello', businessA, 'phone-a', '919555555555'); age();
  const batch = claim(businessA, 'phone-a:919555555555'); save(batch);
  sql(`update inbound_message_buffer set message_timestamp=clock_timestamp()-interval '25 hours'
    where business_id=${quote(businessA)} and customer_phone='919555555555'`);
  assert.equal(json(`select renew_inbound_batch(${batchArgs(batch)});`).can_send, false);
  assert.equal(json(`select begin_batch_delivery(${batchArgs(batch)},'reply_1');`).allowed, false);
  finish(batch);
});

test('context contains twenty ordered prior messages and excludes another session and pending next-turn text', () => {
  const customer = '919666666666';
  const session = `phone-a:${customer}`;
  sql(`insert into wa_messages (business_id, phone_number_id, customer_phone, session_id, message_id,
    wa_message_id, direction, status, body, created_at)
    select ${quote(businessA)},'phone-a',${quote(customer)},${quote(session)},'history-'||ordinal,
      'history-'||ordinal,'outbound','sent','Past message '||ordinal,
      clock_timestamp()-interval '1 hour'+ordinal*interval '1 second' from generate_series(1,25) ordinal;`);
  ingest('context-current', 'Price?', businessA, 'phone-a', customer, 'out-first'); age();
  const batch = claim(businessA, session);
  ingest('context-next', 'This belongs to the next turn', businessA, 'phone-a', customer);
  const context = json(`select workflow_context(${quote(businessA)},${quote(session)},array['context-current']);`);
  assert.equal(context.history.length, 20);
  assert.equal(context.history[0].body, 'Past message 6');
  assert.equal(context.history.at(-1).body, 'Past message 25');
  assert.ok(context.history.every(message => message.session_id === session && !message.body.includes('next turn')));
  assert.deepEqual(context.quoted_messages, []);
  finish(batch);
});

test('tenant owners cannot update foreign leads or invoke privileged worker functions', () => {
  const foreignBefore = sql(`select budget from leads where business_id=${quote(businessA)} and customer_phone='919333333333'`);
  sql(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
    update leads set budget='cross-tenant alteration' where business_id=${quote(businessA)};`);
  assert.equal(sql(`select budget from leads where business_id=${quote(businessA)} and customer_phone='919333333333'`), foreignBefore);
  assert.throws(() => sql(`set role authenticated; select claim_inbound_batch(${quote(businessA)},'phone-a:919333333333');`), /permission denied/);
  assert.throws(() => sql('set role anon; select * from unknown_messages;'), /permission denied/);
  assert.throws(() => sql('set role authenticated; select * from unknown_messages;'), /permission denied/);
});

test('tenant members can set every dashboard lead stage without confirming an appointment', () => {
  const component = fs.readFileSync(path.join(__dirname, '..', 'src/components/leads/LeadsClient.tsx'), 'utf8');
  const stages = [...component.match(/const STAGES = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const legacyStage of ['contacted', 'converted', 'closed']) assert.ok(stages.includes(legacyStage));
  const appointmentsBefore = sql('select count(*) from appointment_requests');
  for (const stage of stages) {
    sql(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      update leads set status=${quote(stage)} where business_id=${quote(businessA)} and customer_phone='919333333333';`);
    assert.equal(sql(`select status from leads where business_id=${quote(businessA)} and customer_phone='919333333333'`), stage);
  }
  assert.equal(sql('select count(*) from appointment_requests'), appointmentsBefore);
  assert.throws(() => sql(`update leads set status='invalid-stage' where business_id=${quote(businessA)}`), /leads_status_check/);
});

const operator = '00000000-0000-0000-0000-000000000001';
const owner = '00000000-0000-0000-0000-000000000002';
const manager = '00000000-0000-0000-0000-000000000003';
const unverified = '00000000-0000-0000-0000-000000000004';
const secondOwner = '00000000-0000-0000-0000-000000000005';
let createdClient;
const manageClient = (actor, action, business, payload) => json(`select crm_manage_client(${quote(actor)},${quote(action)},${business ? quote(business) : 'null'},${quote(JSON.stringify(payload))}::jsonb)`);
const saveSettings = (actor, business, settings, style = null) => json(`select crm_save_ai_settings(${quote(actor)},${quote(business)},${quote(JSON.stringify(settings))}::jsonb,null,${style ? `${quote(JSON.stringify(style))}::jsonb` : 'null'})`);

test('CRM operator creates an isolated paused client; ordinary owners cannot provision tenants', () => {
  const payload = { name: 'Cedar Homes', phone_number_id: '123456789', waba_id: '987654321', owner_phone: '919123456789' };
  assert.throws(() => manageClient(owner, 'create', null, payload), /Platform operator access required/);
  assert.throws(() => manageClient(operator, 'create', null, { ...payload, is_active: true }), /New clients start paused/);
  createdClient = manageClient(operator, 'create', null, payload);
  assert.equal(createdClient.is_active, false);
  assert.equal(createdClient.connection_status, 'pending');
  assert.equal(sql(`select role from business_members where business_id=${quote(createdClient.id)} and user_id=${quote(operator)}`), 'platform_admin');
  assert.equal(sql(`select count(*) from business_members where business_id=${quote(createdClient.id)}`), '1');
  assert.deepEqual(json(`select settings->'catalog' from businesses where id=${quote(createdClient.id)}`), { projects: [] });
  assert.throws(() => manageClient(operator, 'create', null, payload), /duplicate key/);
  assert.throws(() => manageClient(operator, 'update', businessB, { name: 'Foreign change' }), /Owner or manager access required/);
});

test('CRM member management requires verified accounts and protects operator and last-owner access', () => {
  sql(`insert into auth.users(id,email,email_confirmed_at) values (${quote(manager)},'manager@example.invalid',now()),(${quote(unverified)},'pending@example.invalid',null),(${quote(secondOwner)},'owner2@example.invalid',now())`);
  assert.throws(() => manageClient(operator, 'upsert_member', createdClient.id, { email: 'pending@example.invalid', role: 'agent' }), /verify their CRM email/);
  assert.throws(() => manageClient(operator, 'upsert_member', createdClient.id, { email: 'b@example.invalid', role: 'platform_admin' }), /Choose owner, manager or agent/);
  manageClient(operator, 'upsert_member', createdClient.id, { email: 'B@example.invalid', role: 'owner' });
  manageClient(owner, 'upsert_member', createdClient.id, { email: 'manager@example.invalid', role: 'manager' });
  assert.throws(() => manageClient(manager, 'upsert_member', createdClient.id, { email: 'owner2@example.invalid', role: 'agent' }), /Owner access required/);
  assert.throws(() => manageClient(owner, 'remove_member', createdClient.id, { user_id: operator }), /platform operator/);
  assert.throws(() => manageClient(owner, 'remove_member', createdClient.id, { user_id: owner }), /own access/);
  assert.throws(() => manageClient(operator, 'remove_member', createdClient.id, { user_id: owner }), /last owner/);
  manageClient(operator, 'upsert_member', createdClient.id, { email: 'owner2@example.invalid', role: 'owner' });
  manageClient(operator, 'remove_member', createdClient.id, { user_id: owner });
  assert.equal(sql(`select count(*) from business_members where business_id=${quote(businessB)} and user_id=${quote(owner)}`), '1');
  assert.equal(sql(`select count(*) from business_members where business_id=${quote(createdClient.id)} and user_id=${quote(owner)}`), '0');
});

test('CRM activation requires verified connection and never resets human takeover', () => {
  assert.throws(() => manageClient(manager, 'update', createdClient.id, { is_active: true }), /Verify the WhatsApp connection/);
  assert.throws(() => sql(`select crm_record_connection_check(${quote(operator)},${quote(createdClient.id)},'999999999','987654321')`), /connection changed/);
  sql(`select crm_record_connection_check(${quote(operator)},${quote(createdClient.id)},'123456789','987654321')`);
  assert.equal(manageClient(manager, 'update', createdClient.id, { is_active: true }).is_active, true);
  ingest('crm-human', 'Hello', createdClient.id, '123456789', '919777777777');
  sql(`update conversations set human_takeover=true where business_id=${quote(createdClient.id)}`);
  manageClient(manager, 'update', createdClient.id, { is_active: false });
  assert.equal(ingest('crm-paused', 'Hello', null, '123456789', '919777777777').accepted, false);
  manageClient(manager, 'update', createdClient.id, { is_active: true });
  assert.equal(sql(`select human_takeover from conversations where business_id=${quote(createdClient.id)}`), 't');
  assert.throws(() => manageClient(operator, 'update', createdClient.id, { phone_number_id: '555555555' }), /identity can only be corrected/);
});

test('CRM settings flow through real SQL into replies, with next-turn price changes and isolated style', () => {
  const { buildContext, prepareReply } = require('../workflows/lib/conversation-policy');
  const settings = { catalog: { projects: [{ id: 'cedar', name: 'Cedar Court', location: 'Sector 20', status: 'Upcoming', configurations: [{ bhk: 2, price: '₹55 lakh' }] }] }, services: 'Homes', products: 'Apartments', prices: 'Indicative', faqs: 'Pets allowed', opening_hours: '9–5', ai_tone: 'Warm', booking_system: 'Staff confirms', contact_details: 'Desk', owner_phone: '919123456789', greeting_en: 'Hello from Cedar!' };
  saveSettings(manager, createdClient.id, settings, { style_notes: 'Short replies', example_customer: 'Hi', example_reply: 'Hello' });
  const load = () => json(`select workflow_context(${quote(createdClient.id)},'123456789:919777777777')`);
  const respond = () => {
    const loaded = load();
    return prepareReply({ context: buildContext({ business: loaded.business, style: loaded.style_profile, messages: [{ business_id: createdClient.id, body: 'Cedar Court 2 BHK price' }] }), output: { reply_1: 'Stale price ₹55 lakh' } });
  };
  assert.match(respond().reply_text_1, /₹55 lakh/);
  settings.catalog.projects[0].configurations[0].price = '₹59 lakh';
  saveSettings(manager, createdClient.id, settings);
  assert.match(respond().reply_text_1, /₹59 lakh/);
  assert.doesNotMatch(respond().reply_text_1, /₹55 lakh/);
  assert.equal(load().style_profile.style_notes, 'Short replies');
  assert.equal(load().business.faqs, 'Pets allowed');
  sql(`update businesses set whatsapp_access_token_enc='do-not-export-token', settings=settings || '{"api_key":"do-not-export-key"}'::jsonb where id=${quote(createdClient.id)}`);
  assert.doesNotMatch(JSON.stringify(load()), /do-not-export|api_key|whatsapp_access_token_enc/);
  const other = json(`select workflow_context(${quote(businessB)},'phone-b:919777777777')`);
  assert.equal(other.style_profile, null);
  assert.doesNotMatch(JSON.stringify(other), /Cedar Court|Pets allowed|Short replies/);
  saveSettings(manager, createdClient.id, { catalog: { projects: [] }, services: '', owner_phone: '' });
  assert.deepEqual(load().business.settings.catalog.projects, []);
  assert.equal(load().business.services, '');
});

test('CRM settings and style save atomically, with safe audit entries and no foreign writes', () => {
  const previous = json(`select settings from businesses where id=${quote(createdClient.id)}`);
  assert.throws(() => saveSettings(owner, createdClient.id, { faqs: 'Foreign change' }), /Owner or manager access required/);
  assert.throws(() => saveSettings(manager, createdClient.id, { access_token: 'forbidden' }), /Invalid AI settings/);
  sql(`create function reject_test_style() returns trigger language plpgsql as $$ begin raise exception 'test style failure'; end; $$;
    create trigger reject_test_style before insert or update on response_style_profiles for each row execute function reject_test_style();`);
  assert.throws(() => saveSettings(manager, createdClient.id, { faqs: 'Do not persist' }, { style_notes: 'Failure' }), /test style failure/);
  sql('drop trigger reject_test_style on response_style_profiles; drop function reject_test_style();');
  assert.deepEqual(json(`select settings from businesses where id=${quote(createdClient.id)}`), previous);
  assert.doesNotMatch(sql(`select metadata::text from audit_log where action='crm.ai_settings.updated'`), /Pets allowed|Cedar Court|Do not persist/);
  sql(`update response_style_profiles set approved=false where business_id=${quote(createdClient.id)}`);
  assert.equal(json(`select workflow_context(${quote(createdClient.id)},'123456789:919777777777')`).style_profile, null);
});

test('anonymous and browser roles cannot impersonate actors through CRM service RPCs', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const invocation of [
      `crm_manage_client(${quote(operator)},'update',${quote(createdClient.id)},'{}')`,
      `crm_save_ai_settings(${quote(operator)},${quote(createdClient.id)},'{}')`,
      `crm_record_connection_check(${quote(operator)},${quote(createdClient.id)},'123456789','987654321')`,
    ]) assert.throws(() => sql(`set role ${role}; select ${invocation}`), /permission denied/);
  }
});

test('CRM migration seeds only the verified legacy catalog and preserves subsequent CRM edits', () => {
  const legacyBusiness = 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb';
  sql(`insert into businesses(id,name,phone_number_id,settings) values (${quote(legacyBusiness)},'Amolik Group','1383698251495317','{"catalog_key":"amolik","owner_phone":"917250307422"}')`);
  const migrate = () => execFileSync(path.join(bin, 'psql'), [...args, '-f', path.join(__dirname, '..', 'migrations/006_crm_client_control.sql')], { stdio: 'pipe' });
  migrate();
  const seeded = json(`select settings->'catalog' from businesses where id=${quote(legacyBusiness)}`);
  assert.equal(seeded.projects.length, 16);
  assert.equal(seeded.projects[0].configurations[1].price, '₹62.78L–₹63.42L');
  assert.equal(seeded.owner_phone, undefined);
  sql(`update businesses set settings=jsonb_set(settings,'{catalog,projects}','[]') where id=${quote(legacyBusiness)}`);
  migrate();
  assert.deepEqual(json(`select settings->'catalog'->'projects' from businesses where id=${quote(legacyBusiness)}`), []);
  assert.equal(sql(`select settings ? 'catalog' from businesses where id=${quote(businessB)}`), 'f');
});
