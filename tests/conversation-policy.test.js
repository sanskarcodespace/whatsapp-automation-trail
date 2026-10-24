const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildContext, prepareReply, detectIntent } = require('../workflows/lib/conversation-policy');

const catalog = require('../workflows/data/amolik-catalog.json');
const business = { id: 'amolik-client', name: 'Amolik Group', phone_number_id: 'phone-a', settings: { catalog, owner_phone: catalog.owner_phone } };
const row = (body, direction = 'inbound', extra = {}) => ({ business_id: business.id, session_id: 'phone-a:919999999999', customer_phone: '919999999999', phone_number_id: 'phone-a', message_id: 'current', body, direction, created_at: '2026-10-22T12:00:00Z', ...extra });
const context = (body, options = {}) => buildContext({ business, messages: [row(body)], ...options });
const reply = (body, output = {}, options = {}) => prepareReply({ context: context(body, options), output });
const combined = result => `${result.reply_text_1} ${result.reply_text_2}`;

test('CRM catalog edits change the next reply without changing another client', () => {
  const tenant = { id: 'crm-client', name: 'Cedar Homes', settings: { catalog: { projects: [{ id: 'cedar', name: 'Cedar Court', location: 'Sector 20', status: 'Upcoming', configurations: [{ bhk: 2, price: '₹55 lakh' }], amenities: ['Garden'] }] } } };
  const inquiry = () => buildContext({ business: tenant, messages: [{ business_id: tenant.id, body: 'Cedar Court 2 bhk price', customer_phone: '919123456789' }] });
  assert.match(combined(prepareReply({ context: inquiry(), output: {} })), /₹55 lakh/);
  tenant.settings.catalog.projects[0].configurations[0].price = '₹59 lakh';
  const updated = prepareReply({ context: inquiry(), output: { reply_1: 'Old price ₹55 lakh' } });
  assert.match(combined(updated), /₹59 lakh/);
  assert.doesNotMatch(combined(updated), /₹55 lakh|Amolik/);
  assert.match(combined(reply('Amolik Heights 2 bhk price')), /62.78L/);
  assert.doesNotMatch(context('Hello').user_prompt, /Cedar Court/);
});

test('clearing a CRM catalog never resurrects the legacy built-in catalog', () => {
  const empty = buildContext({ business: { ...business, settings: { catalog_key: 'amolik', catalog: { projects: [] }, owner_phone: '' } }, messages: [row('price')] });
  assert.deepEqual(empty.catalog.projects, []);
  assert.equal(empty.owner_phone, '');
  assert.doesNotMatch(empty.user_prompt, /Amolik Heights|Aarvista|Neoliv/);
});

test('all CRM knowledge and approved tenant style reach the model, including explicit clears', () => {
  const settings = { faqs: 'Pets are allowed', products: 'Office suites', services: '', prices: 'Fees on request', ai_tone: 'Warm', opening_hours: '9–5', contact_details: 'Desk 123', booking_system: 'Team confirmation required', handoff_message: 'Your request is noted' };
  const ctx = context('Do you allow pets?', { business: { ...business, services: 'Obsolete service', settings }, style: { business_id: business.id, approved: true, style_notes: 'Be concise', example_customer: 'Hi', example_reply: 'Hello' } });
  const prompt = JSON.parse(ctx.user_prompt);
  for (const [key, value] of Object.entries(settings)) assert.equal(prompt.BUSINESS_DATA[key], value);
  assert.equal(prompt.approved_response_style.style_notes, 'Be concise');
  assert.doesNotMatch(ctx.user_prompt, /Obsolete service/);
  assert.deepEqual(JSON.parse(context('Hi', { style: { business_id: 'foreign', approved: true, style_notes: 'Private style' } }).user_prompt).approved_response_style, {});
  assert.deepEqual(JSON.parse(context('Hi', { style: { business_id: business.id, approved: false, style_notes: 'Unapproved style' } }).user_prompt).approved_response_style, {});
});

test('per-client greetings and human acknowledgements cannot disable handoff safety', () => {
  const configured = { business: { ...business, settings: { greeting_en: 'Hello from Cedar!', greeting_hi: 'Namaste ji!', handoff_message: 'Your request is with our team.', handoff_message_hi: 'Aapki request team ke paas hai.', owner_phone: '919123456789' } } };
  assert.equal(reply('Hi', {}, configured).reply_text_1, 'Hello from Cedar!');
  assert.equal(reply('Namaste', {}, configured).reply_text_1, 'Namaste ji!');
  const handoff = reply('Please call me', {}, configured);
  assert.equal(handoff.reply_text_1, 'Your request is with our team.');
  assert.equal(handoff.handoff, true);
  assert.equal(handoff.owner_phone, '919123456789');
  configured.business.settings.handoff_message = 'Your visit is confirmed!';
  assert.doesNotMatch(combined(reply('Please call me', {}, configured)), /visit is confirmed/i);
  configured.business.settings.greeting_en = 'Can I book a site visit for you?';
  assert.doesNotMatch(combined(reply('Hi', {}, configured)), /visit/i);
});

test('businesses without a project catalog can answer service and FAQ questions', () => {
  const ctx = buildContext({ business: { id: 'service-client', name: 'Support Desk', settings: { services: 'Repairs', faqs: 'Repair fee: ₹200', catalog: { projects: [] } } }, messages: [{ business_id: 'service-client', body: 'What is the repair price?' }] });
  assert.equal(prepareReply({ context: ctx, output: { reply_1: 'The repair fee is ₹200.' } }).reply_text_1, 'The repair fee is ₹200.');
});

test('greetings and wellbeing are social with no pitch or handoff', () => {
  for (const message of ['Hi', 'Hello', 'How are you?', 'Kaise ho']) {
    const result = reply(message, { reply_1: 'Book a site visit 😊', handoff_required: true });
    assert.doesNotMatch(combined(result), /visit|bhk|property|😊/i);
    assert.equal(result.handoff, false);
    assert.equal(result.has_second_message, false);
  }
  assert.match(reply('Kaise ho').reply_text_1, /badhiya/);
  assert.equal(context('Do you have a clubhouse?').language, 'english');
  assert.equal(context('details do').language, 'hinglish');
});

test('unprompted visits and forced smiles are removed, regardless of model flags', () => {
  const result = reply('What are the opening hours?', { reply_1: 'We open at 10 AM. 😊', reply_2: 'Would you like to book a site visit?', appointment_requested: true, handoff_required: true });
  assert.doesNotMatch(combined(result), /site visit|😊/i);
  assert.equal(result.appointment_requested, false);
  assert.equal(result.handoff, false);
});

test('explicit visits are pending human confirmation even if model fails', () => {
  for (const message of ['mujhe visit karna hai', 'can I visit the site?', 'kab dekhne aa sakta hoon']) {
    const result = reply(message, { ai_failed: true });
    assert.equal(result.appointment_requested, true);
    assert.equal(result.handoff, true);
    assert.equal(result.conversation_payload.human_takeover, true);
    assert.equal(result.owner_phone, '917250307422');
    assert.equal(result.notify_owner, true);
    assert.match(result.reply_text_2, /confirm/);
    assert.doesNotMatch(combined(result), /visit is confirmed|schedule ho gaya/);
  }
});

test('negated visits, informational visit questions and tiny messages are not consent', () => {
  for (const message of ['No visit please', 'visit nahi karna', "don't call me", 'What is the site visit policy?', '.', '?', 'Yes', 'ha', 'send', 'price']) {
    assert.deepEqual(detectIntent(message), { visit: false, human: false });
    const result = reply(message, { appointment_requested: true, handoff_required: true });
    assert.equal(result.handoff, false);
    assert.ok(result.reply_text_1);
  }
});

test('2 bh is preserved in lead memory and cannot yield a 1 or 3 BHK recommendation', () => {
  const result = reply('2 bh chahiye', { reply_1: 'Try Amolik Park 3 BHK for ₹65L.', preferred_bhk: '3 BHK' });
  assert.equal(result.lead_payload.preferred_bhk, '2 BHK');
  assert.match(combined(result), /Amolik Heights/);
  assert.doesNotMatch(combined(result), /[13]\s*BHK|Amolik Park/);
});

test('asking for more 2 BHK projects asks permission before broadening filters', () => {
  const result = reply('aur koi project btao', { reply_1: 'Amolik Sankalp 3 BHK is nice.' }, { lead: { preferred_bhk: '2 BHK', business_id: business.id } });
  assert.match(result.reply_text_1, /Amolik Heights/);
  assert.match(result.reply_text_2, /open/);
  assert.doesNotMatch(combined(result), /3\s*BHK|Sankalp/);
});

test('details stay with the previous project and contain verified possession, price and amenities', () => {
  const result = reply('jaankari chahiye', { reply_1: 'Amolik Park has a pool.' }, { lead: { preferred_bhk: '2 BHK' }, history: [row('Amolik Heights is in Sector 88.', 'outbound', { message_id: 'previous' })] });
  assert.match(combined(result), /Amolik Heights/);
  assert.match(combined(result), /62.78/);
  assert.match(combined(result), /completed/i);
  assert.match(combined(result), /clubhouse/i);
  assert.doesNotMatch(combined(result), /Amolik Park|pool/i);
});

test('an older quoted project overrides the latest unrelated assistant recommendation', () => {
  const result = reply('Price?', {}, { quoted: row('Amolik Park 3 BHK', 'outbound', { message_id: 'quoted' }), history: [row('Amolik Heights 3 BHK', 'outbound', { message_id: 'recent' })], lead: { preferred_bhk: '3 BHK', interested_service: 'Amolik Heights' } });
  assert.match(combined(result), /Amolik Park/);
  assert.match(combined(result), /65L/);
  assert.equal(result.lead_payload.interested_service, 'Amolik Park');
});

test('history retains 20 scoped messages and rejects foreign quoted content', () => {
  const history = Array.from({ length: 25 }, (_, index) => row(`message ${index}`, index % 2 ? 'outbound' : 'inbound', { message_id: `old-${index}`, created_at: new Date(1700000000000 + index * 1000).toISOString() }));
  const result = context('price', { history: [...history, row('Foreign secret', 'outbound', { business_id: 'other', message_id: 'foreign' })], quoted: row('Foreign quoted secret', 'outbound', { business_id: 'other' }) });
  assert.equal(result.history_count, 20);
  assert.doesNotMatch(result.user_prompt, /Foreign/);
  assert.equal(result.quoted_found, false);
});

test('other businesses never inherit Amolik catalog or owner', () => {
  const other = { id: 'other', name: 'Other Client', phone_number_id: 'phone-b', settings: {} };
  const ctx = buildContext({ business: other, messages: [row('Hello', 'inbound', { business_id: 'other', phone_number_id: 'phone-b' })] });
  const result = prepareReply({ context: ctx, output: { reply_1: 'Amolik Heights is available' } });
  assert.equal(ctx.owner_phone, '');
  assert.doesNotMatch(ctx.user_prompt, /Amolik Heights/);
  assert.doesNotMatch(combined(result), /Amolik/);
});

test('progressive lead capture preserves known values and closed status', () => {
  const result = reply('Budget 70 lakh, Sector 88', { customer_name: 'Invented Name', budget: '80 lakh' }, { lead: { customer_name: 'Rahul', preferred_bhk: '2 BHK', interested_service: 'Amolik Heights', status: 'won' } });
  assert.equal(result.lead_payload.customer_name, 'Rahul');
  assert.equal(result.lead_payload.budget, '70 lakh');
  assert.equal(result.lead_payload.location, 'Sector 88');
  assert.equal(result.lead_payload.status, 'won');
});

test('callback requests notify owner and active takeover suppresses all replies', () => {
  const result = reply('owner se baat karao', { reply_1: 'Here is a property' });
  assert.equal(result.handoff, true);
  assert.equal(result.appointment_requested, false);
  assert.equal(result.notify_owner, true);
  const ctx = { ...context('price'), human_takeover: true };
  const suppressed = prepareReply({ context: ctx, output: { reply_1: 'Hello' } });
  assert.equal(suppressed.reply_text_1, '');
  assert.equal(suppressed.reply_text_2, '');
  assert.equal(suppressed.notify_owner, false);
});

test('each bubble stays short and malformed model output gets a usable fallback', () => {
  const result = reply('Tell me something useful', { reply_1: 'A sentence. '.repeat(100), reply_2: 'Another sentence. '.repeat(100) });
  assert.ok(result.reply_text_1.length <= 320);
  assert.ok(result.reply_text_2.length <= 320);
  assert.ok(reply('price', { output: '{broken-json' }).reply_text_1);
});

test('viewing a brochure and asking about visit policy never request appointments', () => {
  for (const message of ['Can I view the brochure?', 'When is the site visit policy updated?', 'What does call me mean?', 'If I want to visit what happens?', 'I already booked a visit', 'My visit is on hold']) {
    assert.deepEqual(detectIntent(message), { visit: false, human: false }, message);
    const result = reply(message, { appointment_requested: true, handoff_required: true });
    assert.equal(result.appointment_requested, false, message);
    assert.equal(result.notify_owner, false, message);
  }
});

test('later cancellation in a debounced turn overrides an earlier visit or callback', () => {
  assert.deepEqual(detectIntent('I want to visit tomorrow\nNo visit please'), { visit: false, human: false });
  assert.deepEqual(detectIntent('call me\nDo not call me'), { visit: false, human: false });
  assert.deepEqual(detectIntent('I want to visit\nNo thanks'), { visit: false, human: false });
  assert.deepEqual(detectIntent('No visit, but please call me'), { visit: false, human: true });
  assert.deepEqual(detectIntent('Do not call me, I want to visit tomorrow'), { visit: true, human: false });
});

test('unsolicited appointment and viewing invitations are removed', () => {
  const result = reply('What are your hours?', { reply_1: 'We open at 10 AM.', reply_2: 'Would you like to come see the property? Shall I arrange an appointment?' });
  assert.equal(result.reply_text_1, 'We open at 10 AM.');
  assert.equal(result.reply_text_2, '');
});

test('two-bubble history retains the project when the second bubble has only amenities', () => {
  const result = reply('details do', {}, { history: [row('Amolik Park is in Sector 88.', 'outbound', { message_id: 'first' }), row('Would you like the prices?', 'outbound', { message_id: 'second' })] });
  assert.match(combined(result), /Amolik Park/);
  assert.match(combined(result), /under construction/);
  assert.doesNotMatch(combined(result), /Amolik Heights/);
});

test('ambiguous short replies clarify without picking the first catalog project', () => {
  for (const message of ['price', 'send', 'Yes', 'ha', 'details do']) {
    const result = reply(message, { output: '{invalid json' });
    assert.doesNotMatch(combined(result), /Amolik Heights|Amolik Park/);
    assert.match(result.reply_text_1, /\?$/);
  }
  const ambiguous = reply('price', { reply_1: 'Amolik Heights costs ₹70L' }, { history: [row('Amolik Park and Amolik Sankalp are options.', 'outbound', { message_id: 'previous' })] });
  assert.doesNotMatch(combined(ambiguous), /70L/);
  assert.match(ambiguous.reply_text_1, /Which project/);
});

test('quoted project without the preferred BHK asks before changing the requirement', () => {
  const result = reply('price?', { reply_1: 'Amolik Park 3 BHK for ₹65L.' }, { lead: { preferred_bhk: '2 BHK' }, quoted: row('Amolik Park', 'outbound', { message_id: 'quoted' }) });
  assert.match(result.reply_text_1, /Amolik Park does not list a 2 BHK/);
  assert.match(result.reply_text_2, /Should I keep your 2 BHK/);
  assert.doesNotMatch(combined(result), /3 BHK|Amolik Heights|65L/);
});

test('asking a listing price does not overwrite customer budget', () => {
  const result = reply('Is the quoted 70 lakh price correct?', { budget: '70 lakh' }, { lead: { budget: '50 lakh' } });
  assert.equal(result.lead_payload.budget, '50 lakh');
  const noBudget = reply('Does Amolik Park cost 65 lakh?', { budget: '65 lakh' });
  assert.equal(noBudget.lead_payload.budget, null);
  const answeredBudget = reply('70 lakh', { budget: '70 lakh' }, { history: [row('What is your budget?', 'outbound', { message_id: 'previous' })] });
  assert.equal(answeredBudget.lead_payload.budget, '70 lakh');
});

test('requested time survives model failure while appointment remains unconfirmed', () => {
  const result = reply('I want to visit tomorrow at 5 PM', { ai_failed: true });
  assert.equal(result.lead_payload.preferred_appointment_time, 'tomorrow at 5 PM');
  assert.equal(result.appointment_status, 'pending_human_confirmation');
  assert.match(result.owner_alert_text, /tomorrow at 5 PM/);
});

test('catalog has all 16 groups, exact client pricing and no invented amenities', () => {
  const catalog = context('Hi').catalog;
  assert.equal(catalog.projects.length, 16);
  const heights = catalog.projects.find(project => project.id === 'heights');
  assert.equal(heights.configurations.find(configuration => configuration.bhk === 2).price, '₹62.78L–₹63.42L');
  assert.equal(catalog.projects.find(project => project.id === 'residency').configurations[0].price, 'from ₹1.50 Cr');
  assert.equal(catalog.projects.find(project => project.id === 'sankalp').amenities.length, 0);
  assert.equal(catalog.projects.find(project => project.id === 'upcoming_plotted').status, 'Upcoming');
  const unknownPrice = reply('Concordia Living-I price?', { reply_1: 'It is ₹69.97L.' });
  assert.match(combined(unknownPrice), /verification/);
  assert.doesNotMatch(combined(unknownPrice), /69.97/);
});

test('completed property never implies a unit is currently available', () => {
  const result = reply('Is Amolik Heights available?', { reply_1: 'Yes, units are available.' }, { lead: { preferred_bhk: '2 BHK' } });
  assert.match(combined(result), /completed and handed over/);
  assert.match(combined(result), /availability needs consultant verification/);
  assert.doesNotMatch(combined(result), /units are available/);
});

test('negated BHKs do not replace the preference or permit other configurations', () => {
  for (const message of ['3 BHK nahi chahiye', 'I do not want 3 BHK', "Don't show other BHKs", 'No plots please']) {
    const ctx = context(message, { lead: { preferred_bhk: '2 BHK' } });
    assert.equal(ctx.preferred_bhk, '2 BHK', message);
    assert.equal(ctx.allows_other_bhk, false, message);
    const result = prepareReply({ context: ctx, output: { reply_1: 'Amolik Park 3 BHK costs ₹65L.' } });
    assert.doesNotMatch(combined(result), /3 BHK|65L/, message);
  }
  assert.equal(context('Not interested in 3 BHK, only 2 BHK').preferred_bhk, '2 BHK');
});

test('lead, history and quote belonging to another customer are excluded', () => {
  const wrongCustomer = { business_id: business.id, customer_phone: '918888888888' };
  const ctx = context('price', { lead: { ...wrongCustomer, customer_name: 'Private Name', budget: 'Private budget' }, history: [{ ...wrongCustomer, body: 'Private history', direction: 'outbound' }], quoted: { ...wrongCustomer, body: 'Private quote' } });
  assert.doesNotMatch(ctx.user_prompt, /Private/);
  assert.equal(ctx.quoted_found, false);
  assert.equal(ctx.history_count, 0);
});

test('a direct amenities question cannot invent unverified facilities', () => {
  const result = reply('Does Amolik Park have a pool?', { reply_1: 'Yes, it has a swimming pool and gym.' });
  assert.match(combined(result), /need consultant verification/);
  assert.doesNotMatch(combined(result), /swimming pool|gym/);
});
