const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateMessages } = require('../workflows/lib/ingestion');

const now = Date.parse('2026-10-22T12:00:00Z');
function payload(bodies, phone = 'phone-a', customer = '919999999999') {
  return { metadata: { phone_number_id: phone }, messages: bodies.map((body, index) => ({
    id: `${phone}-${index}`, from: customer, type: 'text', timestamp: String(now / 1000), text: { body },
  })) };
}

test('all messages and clients in webhook are ingested, including one-character turns', () => {
  const result = validateMessages([{ entry: [{ changes: [{ value: payload(['.', '?', 'ha']) }, { value: payload(['price'], 'phone-b') }] }] }], now);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map(message => message.message_text), ['.', '?', 'ha', 'price']);
  assert.notEqual(result[0].session_id, result[3].session_id);
});

test('quoted id and exact contact remain attached to their own message', () => {
  const input = payload(['Price?']);
  input.messages[0].context = { id: 'quoted-park' };
  input.contacts = [{ wa_id: '123', profile: { name: 'Wrong person' } }, { wa_id: '919999999999', profile: { name: 'Rahul' } }];
  const [message] = validateMessages([input], now);
  assert.equal(message.customer_name, 'Rahul');
  assert.equal(message.quoted_message_id, 'quoted-park');
});

test('status callbacks, echoes and invalid timestamps cannot trigger a send', () => {
  const input = payload(['hello']);
  input.metadata.display_phone_number = input.messages[0].from;
  assert.equal(validateMessages([input, { statuses: [{ status: 'delivered' }] }], now).length, 0);
  delete input.metadata.display_phone_number;
  input.messages[0].timestamp = 'bad';
  assert.equal(validateMessages([input], now).length, 0);
});

test('old inbound text remains available for durable history but is flagged outside reply window', () => {
  const input = payload(['keep this']);
  input.messages[0].timestamp = String(now / 1000 - 25 * 3600);
  const [message] = validateMessages([input], now);
  assert.equal(message.message_text, 'keep this');
  assert.equal(message.reply_window_expired, true);
});
