const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const databaseUrl = 'https://rjcdzlqspauyqzqtmwcq.supabase.co';
const databaseCredentials = { supabaseApi: { id: 'qD5fVumEBqY7gR7C', name: 'Supabase account 2' } };
const whatsappCredentials = { whatsAppApi: { id: '2uvLAtW94OchN9Gs', name: 'WhatsApp account' } };

function embedModule(filename) {
  let source = fs.readFileSync(path.join(root, filename), 'utf8');
  return `const policy = (() => { const module = { exports: {} };\n${source}\nreturn module.exports; })();\n`;
}

function buildWorkflow() {
  const nodes = [];
  const connections = {};
  function add(name, type, parameters, extra = {}) {
    const index = nodes.length;
    nodes.push({ id: createHash('sha256').update(name).digest('hex').slice(0, 32), name, type, typeVersion: 1, position: [(index % 8) * 260, Math.floor(index / 8) * 240], parameters, ...extra });
  }
  function link(source, target, output = 0, type = 'main') {
    connections[source] ||= {};
    connections[source][type] ||= [];
    while (connections[source][type].length <= output) connections[source][type].push([]);
    connections[source][type][output].push({ node: target, type, index: 0 });
  }
  function code(name, source) {
    const itemSafeSource = source.replace(/\$json\b/g, '$input.first().json').replace(/\.item\.json/g, '.itemMatching(0).json');
    add(name, 'n8n-nodes-base.code', { mode: 'runOnceForAllItems', jsCode: itemSafeSource }, { typeVersion: 2 });
  }
  function rpc(name, method, body, extra = {}) {
    add(name, 'n8n-nodes-base.httpRequest', {
      method: 'POST', url: `${databaseUrl}/rest/v1/rpc/${method}`,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify(${body}) }}`,
      options: { timeout: 30000 },
    }, { typeVersion: 4.5, credentials: databaseCredentials, retryOnFail: true, maxTries: 2, waitBetweenTries: 1000, ...extra });
  }
  function condition(name, expression) {
    add(name, 'n8n-nodes-base.if', { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: name, leftValue: `={{ ${expression} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, { typeVersion: 2.2 });
  }
  function wait(name, amount) {
    add(name, 'n8n-nodes-base.wait', { resume: 'timeInterval', amount, unit: 'seconds' }, { typeVersion: 1.1 });
  }
  const identity = "$('Batch Identity').item.json";
  const prepared = "$('Prepared Result').item.json";
  const batchArgs = `p_business_id: ${identity}.business_id, p_batch_id: ${identity}.batch_id, p_claim_token: ${identity}.claim_token`;
  const policy = embedModule('workflows/lib/conversation-policy.js');

  add('WhatsApp Trigger', 'n8n-nodes-base.whatsAppTrigger', { updates: ['messages'], options: {} }, { webhookId: 'f9d836a9-99e1-4f32-a565-32a380e6542f', credentials: { whatsAppTriggerApi: { id: 'KhuIJKPEBSOm44WB', name: 'WhatsApp OAuth account' } } });
  code('Validate Message', embedModule('workflows/lib/ingestion.js') + 'return policy.validateMessages($input.all()).map(message => ({ json: message }));');
  rpc('Check Duplicates', 'ingest_inbound_message', '{ p_business_id: null, p_phone_number_id: $json.phone_number_id, p_customer_phone: $json.customer_phone, p_message_id: $json.message_id, p_body: $json.message_text, p_customer_name: $json.customer_name, p_quoted_message_id: $json.quoted_message_id, p_message_timestamp: $json.message_timestamp, p_metadata: { reply_window_expired: $json.reply_window_expired } }');
  code('Unique Sessions', 'const sessions = new Map();\nfor (const item of $input.all()) { const row = item.json; if (row.business_id && row.session_id) sessions.set(JSON.stringify([row.business_id, row.session_id]), { business_id: row.business_id, session_id: row.session_id }); }\nreturn [...sessions.values()].map(json => ({ json }));');
  wait('Debounce Quiet Window', 2);
  add('Recover Pending Turns', 'n8n-nodes-base.scheduleTrigger', { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, { typeVersion: 1.2 });
  rpc('Find Pending Sessions', 'list_ready_inbound_sessions', '{ p_limit: 100 }');
  code('Normalize Sessions', 'return $input.all().flatMap(item => (Array.isArray(item.json) ? item.json : [item.json])).filter(row => row.business_id && row.session_id).map(json => ({ json }));');
  add('Loop Sessions', 'n8n-nodes-base.splitInBatches', { batchSize: 1, options: {} }, { typeVersion: 3 });
  code('Session Identity', 'return $input.all().map((item, index) => ({ json: { business_id: item.json.business_id, session_id: item.json.session_id }, pairedItem: { item: index } }));');
  rpc('Aggregate & Check Winner', 'claim_inbound_batch', '{ p_business_id: $json.business_id, p_session_id: $json.session_id, p_quiet_seconds: 2, p_lease_seconds: 300 }');
  condition('Should Process Batch?', '$json.should_process === true');
  condition('Quiet Window Active?', '$json.reason === "quiet_window_not_elapsed" || $json.reason === "quiet_window_active"');
  wait('Wait for Quiet', 2);
  code('Restore Session', "return [{ json: $('Session Identity').item.json, pairedItem: { item: 0 } }];");
  code('Batch Identity', 'return [{ json: $json, pairedItem: { item: 0 } }];');
  rpc('Load Tenant Context', 'workflow_context', `{ ${batchArgs.split(', p_batch_id')[0]}, p_session_id: ${identity}.session_id, p_message_ids: ${identity}.message_ids }`);
  code('Build AI Context', policy + `const batch = ${identity};\nconst data = $json;\nconst messages = batch.messages.map(message => ({ ...message, business_id: batch.business_id, session_id: batch.session_id, phone_number_id: batch.phone_number_id, customer_phone: batch.customer_phone, customer_name: message.customer_name || batch.customer_name }));\nconst quotedRows = data.quoted_messages || [];\nconst quoted = quotedRows.find(row => row.message_id === batch.quoted_message_id || row.wa_message_id === batch.quoted_message_id) || quotedRows.at(-1) || null;\nconst context = policy.buildContext({ business: data.business, lead: data.lead || {}, history: data.history || [], messages, quoted, style: data.style_profile });\nreturn [{ json: { ...context, batch_id: batch.batch_id, claim_token: batch.claim_token, business_id: batch.business_id, session_id: batch.session_id, phone_number_id: batch.phone_number_id, customer_phone: batch.customer_phone, message_ids: batch.message_ids, batch_message_ids: batch.message_ids, human_takeover: data.conversation?.human_takeover === true, saved_result: batch.saved_result, delivery_state: batch.delivery_state || {} }, pairedItem: { item: 0 } }];`);
  condition('Has Saved Result?', 'Boolean($json.saved_result)');
  condition('Bot Active?', '$json.human_takeover !== true');
  add('AI Agent', '@n8n/n8n-nodes-langchain.agent', { promptType: 'define', text: '={{ $json.user_prompt }}', hasOutputParser: false, options: { systemMessage: '={{ $json.system_prompt }}', maxIterations: 2 } }, { typeVersion: 3.1, onError: 'continueErrorOutput' });
  add('OpenAI Chat Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi', { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' }, builtInTools: {}, options: { maxTokens: 1000, temperature: 0.7, timeout: 60000, maxRetries: 1 } }, { typeVersion: 1.3 });
  code('AI Failure Fallback', 'return [{ json: { ai_failed: true }, pairedItem: { item: 0 } }];');
  code('Prepare Updates', policy + `const context = $('Build AI Context').item.json;\nconst result = policy.prepareReply({ context, output: $json });\nreturn [{ json: { ...result, batch_id: context.batch_id, claim_token: context.claim_token, business_id: context.business_id, session_id: context.session_id, phone_number_id: context.phone_number_id, customer_phone: context.customer_phone, batch_message_ids: context.message_ids }, pairedItem: { item: 0 } }];`);
  rpc('Save Lead and Handoff', 'persist_batch_result', `{ ${batchArgs}, p_result: $json }`);
  code('Restore Prepared Result', "return [{ json: $('Prepare Updates').item.json, pairedItem: { item: 0 } }];");
  code('Restore Saved Result', `return [{ json: ${identity}.saved_result, pairedItem: { item: 0 } }];`);
  code('Prepared Result', 'return [{ json: $json, pairedItem: { item: 0 } }];');

  function delivery(label, part, recipient, body) {
    rpc(`Authorize ${label}`, 'renew_inbound_batch', `{ ${batchArgs}, p_lease_seconds: 300 }`);
    const needsDelivery = part === 'reply_1' ? `${prepared}.reply_text_1` : part === 'reply_2' ? `${prepared}.has_second_message && ${prepared}.reply_text_2` : `${prepared}.notify_owner && ${prepared}.owner_phone`;
    condition(`Should Send ${label}?`, `$json.renewed === true && ${part === 'owner' ? 'true' : '$json.can_send === true'} && Boolean(${needsDelivery}) && !$json.delivery_state?.${part}`);
    rpc(`Reserve ${label}`, 'begin_batch_delivery', `{ ${batchArgs}, p_part: '${part}' }`);
    condition(`${label} Reserved?`, '$json.allowed === true');
    add(label, 'n8n-nodes-base.whatsApp', { operation: 'send', phoneNumberId: `={{ ${identity}.phone_number_id }}`, recipientPhoneNumber: `={{ ${recipient} }}`, textBody: `={{ ${body} }}`, additionalFields: {} }, { typeVersion: 1.1, credentials: whatsappCredentials, retryOnFail: false, onError: 'continueErrorOutput' });
    rpc(`Log ${label}`, 'record_batch_delivery', `{ ${batchArgs}, p_part: '${part}', p_message_id: $json.messages?.[0]?.id || '', p_body: ${body}, p_metadata: { project: ${prepared}.lead_payload?.interested_service, preferred_bhk: ${prepared}.lead_payload?.preferred_bhk, in_reply_to: ${prepared}.inbound_message_id, batch_message_ids: ${identity}.message_ids } }`);
    link(`Authorize ${label}`, `Should Send ${label}?`);
    link(`Should Send ${label}?`, `Reserve ${label}`);
    link(`Reserve ${label}`, `${label} Reserved?`);
    link(`${label} Reserved?`, label);
    link(`${label} Reserved?`, 'Retry or Review Batch', 1);
    link(label, `Log ${label}`);
    link(label, 'Retry or Review Batch', 1);
  }

  delivery('Send WhatsApp Reply', 'reply_1', `${identity}.customer_phone`, `${prepared}.reply_text_1`);
  condition('Has Second Message?', `${prepared}.has_second_message === true`);
  wait('Typing Delay (2s)', 2);
  delivery('Send WhatsApp Reply 2', 'reply_2', `${identity}.customer_phone`, `${prepared}.reply_text_2`);
  delivery('Send WhatsApp to Owner', 'owner', `${prepared}.owner_phone`, `${prepared}.owner_alert_text`);
  rpc('Log Result', 'finish_inbound_batch', `{ ${batchArgs} }`);
  rpc('Human Handling - No Auto Reply', 'finish_inbound_batch', `{ ${batchArgs} }`);
  rpc('Retry or Review Batch', 'retry_inbound_batch', `{ ${batchArgs}, p_error: String($json.error?.message || $json.error || $json.message || 'Delivery reservation refused or provider delivery uncertain').slice(0, 500), p_retry_seconds: 30 }`);
  condition('More Pending Messages?', '$json.pending_count > 0');
  wait('Next Turn Quiet Window', 2);
  code('Drain Session', `return [{ json: { business_id: ${identity}.business_id, session_id: ${identity}.session_id }, pairedItem: { item: 0 } }];`);

  link('WhatsApp Trigger', 'Validate Message'); link('Validate Message', 'Check Duplicates');
  link('Check Duplicates', 'Unique Sessions'); link('Unique Sessions', 'Debounce Quiet Window'); link('Debounce Quiet Window', 'Loop Sessions');
  link('Recover Pending Turns', 'Find Pending Sessions'); link('Find Pending Sessions', 'Normalize Sessions'); link('Normalize Sessions', 'Loop Sessions');
  link('Loop Sessions', 'Session Identity', 1); link('Session Identity', 'Aggregate & Check Winner');
  link('Aggregate & Check Winner', 'Should Process Batch?'); link('Should Process Batch?', 'Batch Identity'); link('Should Process Batch?', 'Quiet Window Active?', 1);
  link('Quiet Window Active?', 'Wait for Quiet'); link('Wait for Quiet', 'Restore Session'); link('Restore Session', 'Aggregate & Check Winner'); link('Quiet Window Active?', 'Loop Sessions', 1);
  link('Batch Identity', 'Load Tenant Context'); link('Load Tenant Context', 'Build AI Context'); link('Build AI Context', 'Has Saved Result?');
  link('Has Saved Result?', 'Restore Saved Result'); link('Has Saved Result?', 'Bot Active?', 1); link('Restore Saved Result', 'Prepared Result');
  link('Bot Active?', 'AI Agent'); link('Bot Active?', 'Human Handling - No Auto Reply', 1);
  link('OpenAI Chat Model', 'AI Agent', 0, 'ai_languageModel'); link('AI Agent', 'Prepare Updates'); link('AI Agent', 'AI Failure Fallback', 1); link('AI Failure Fallback', 'Prepare Updates');
  link('Prepare Updates', 'Save Lead and Handoff'); link('Save Lead and Handoff', 'Restore Prepared Result'); link('Restore Prepared Result', 'Prepared Result');
  link('Prepared Result', 'Authorize Send WhatsApp Reply'); link('Log Send WhatsApp Reply', 'Has Second Message?'); link('Should Send Send WhatsApp Reply?', 'Has Second Message?', 1);
  link('Has Second Message?', 'Typing Delay (2s)'); link('Has Second Message?', 'Authorize Send WhatsApp to Owner', 1); link('Typing Delay (2s)', 'Authorize Send WhatsApp Reply 2');
  link('Log Send WhatsApp Reply 2', 'Authorize Send WhatsApp to Owner'); link('Should Send Send WhatsApp Reply 2?', 'Authorize Send WhatsApp to Owner', 1);
  link('Log Send WhatsApp to Owner', 'Log Result'); link('Should Send Send WhatsApp to Owner?', 'Log Result', 1);
  link('Log Result', 'More Pending Messages?'); link('Human Handling - No Auto Reply', 'More Pending Messages?');
  link('More Pending Messages?', 'Next Turn Quiet Window'); link('More Pending Messages?', 'Loop Sessions', 1); link('Next Turn Quiet Window', 'Drain Session'); link('Drain Session', 'Aggregate & Check Winner');
  link('Retry or Review Batch', 'Loop Sessions');
  return { name: 'WhatsApp AI Support & Lead Gen (Multi-Client)', nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', executionTimeout: 180, saveExecutionProgress: false, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none' }, active: false, pinData: {}, meta: { requiredMigration: '006_crm_client_control.sql', catalogConfiguration: 'All client facts come from businesses.settings.catalog; no built-in catalog' } };
}

module.exports = { buildWorkflow };
if (require.main === module) {
  const content = JSON.stringify(buildWorkflow(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(root, 'workflows/whatsapp_multi_client_ai.json'), 'utf8') !== content) throw new Error('Workflow JSON is out of date; regenerate with scripts/build-workflow.js');
    console.log('Workflow source and generated JSON match.');
  } else if (process.argv.includes('--patch')) {
    const filename = path.join(root, 'workflows/whatsapp_multi_client_ai.json');
    const previous = fs.readFileSync(filename, 'utf8');
    process.stdout.write(`*** Begin Patch\n*** Update File: ${filename}\n@@\n${previous.trimEnd().split('\n').map(line => '-' + line).join('\n')}\n${content.trimEnd().split('\n').map(line => '+' + line).join('\n')}\n*** End Patch\n`);
  } else {
    process.stdout.write(content);
  }
}
