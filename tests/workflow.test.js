const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildWorkflow } = require('../scripts/build-workflow');
const { buildContext, prepareReply } = require('../workflows/lib/conversation-policy');

const workflow = buildWorkflow();
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
const targets = (name, output = 0) => (workflow.connections[name]?.main?.[output] || []).map(edge => edge.node);

test('every connection and expression names an existing node; embedded code compiles', () => {
  for (const [source, ports] of Object.entries(workflow.connections)) {
    assert.ok(nodes.has(source), source);
    for (const outputs of Object.values(ports)) for (const output of outputs) for (const edge of output) assert.ok(nodes.has(edge.node), edge.node);
  }
  for (const node of workflow.nodes) {
    for (const match of JSON.stringify(node.parameters).matchAll(/\$\('([^']+)'\)/g)) assert.ok(nodes.has(match[1]), match[1]);
    if (node.parameters.jsCode) new vm.Script(`(function() {${node.parameters.jsCode}\n})`);
  }
});

test('saved records precede sends, every bubble has its own checkpoint and second bubble waits two seconds', () => {
  assert.deepEqual(targets('Prepare Updates'), ['Save Lead and Handoff']);
  assert.deepEqual(targets('Send WhatsApp Reply'), ['Log Send WhatsApp Reply']);
  assert.deepEqual(targets('Log Send WhatsApp Reply'), ['Has Second Message?']);
  assert.deepEqual(targets('Has Second Message?'), ['Typing Delay (2s)']);
  assert.equal(nodes.get('Typing Delay (2s)').parameters.amount, 2);
  assert.deepEqual(targets('Send WhatsApp Reply 2'), ['Log Send WhatsApp Reply 2']);
  assert.deepEqual(targets('Send WhatsApp Reply 2', 1), ['Retry or Review Batch']);
});

test('multi-item ingest and recoverable queue replace the sliding history window', () => {
  assert.match(nodes.get('Check Duplicates').parameters.url, /rpc\/ingest_inbound_message$/);
  assert.match(nodes.get('Aggregate & Check Winner').parameters.url, /rpc\/claim_inbound_batch$/);
  assert.match(nodes.get('Log Result').parameters.url, /rpc\/finish_inbound_batch$/);
  assert.ok(nodes.has('Recover Pending Turns'));
  assert.ok(nodes.has('Next Turn Quiet Window'));
  assert.doesNotMatch(nodes.get('Validate Message').parameters.jsCode, /slice\(0, 1\)/);
  for (const name of ['Send WhatsApp Reply', 'Send WhatsApp Reply 2', 'Send WhatsApp to Owner']) {
    assert.equal(nodes.get(name).retryOnFail, false);
    assert.match(nodes.get(`Reserve ${name}`).parameters.url, /rpc\/begin_batch_delivery$/);
  }
});

test('model sampling and publish defaults match the reviewed contract', () => {
  assert.equal(nodes.get('OpenAI Chat Model').parameters.options.temperature, 0.7);
  assert.equal(workflow.active, false);
  assert.equal(workflow.meta.requiredMigration, '006_crm_client_control.sql');
  assert.doesNotMatch(JSON.stringify(workflow), /Amolik Heights|amolikCatalog|catalog_key ===/);
  assert.match(nodes.get('Build AI Context').parameters.jsCode, /style: data.style_profile/);
});

test('embedded Prepare Updates executes the same policy as the tested module', () => {
  const business = { id: 'business-a', name: 'Amolik Group', settings: { catalog: require('../workflows/data/amolik-catalog.json') } };
  const context = buildContext({ business, messages: [{ business_id: business.id, session_id: 'phone:customer', message_id: 'inbound', customer_phone: '919999999999', body: '2 bh chahiye' }] });
  const input = { output: JSON.stringify({ reply_1: 'Try Amolik Park 3 BHK.' }) };
  const sandbox = { $input: { first: () => ({ json: input }) }, $: name => {
    assert.equal(name, 'Build AI Context'); return { itemMatching: () => ({ json: context }) };
  } };
  const result = vm.runInNewContext(`(function() {${nodes.get('Prepare Updates').parameters.jsCode}\n})()`, sandbox)[0].json;
  const expected = prepareReply({ context, output: input });
  assert.equal(result.reply_text_1, expected.reply_text_1);
  assert.equal(result.reply_text_2, expected.reply_text_2);
  assert.equal(result.lead_payload.preferred_bhk, '2 BHK');
});
