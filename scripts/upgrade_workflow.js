const fs = require('fs');
const path = require('path');

const srcPath = '/Users/sanskar/.gemini/antigravity-ide/brain/b67a9513-760d-4ee8-986a-06c6c7b35b03/.system_generated/steps/1293/output.txt';
const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const wf = raw.workflow;

// 1. Update 'Validate Message'
const validateMsg = wf.nodes.find(n => n.name === 'Validate Message');
validateMsg.parameters.jsCode = `// Accepts only fresh, inbound customer TEXT messages. Drops status events,
// echoes of our own number, non-text media, and messages outside the reply window.
const cfg = $('Workflow Config').first().json;
const windowHours = Number(cfg.reply_window_hours || 24);
const out = [];
for (const item of $('WhatsApp Trigger').all()) {
  const j = item.json || {};
  const values = [];
  if (Array.isArray(j.entry)) {
    for (const e of j.entry) for (const c of (e.changes || [])) values.push(c.value || {});
  } else if (j.value) {
    values.push(j.value);
  } else {
    values.push(j);
  }
  for (const v of values) {
    const meta = v.metadata || {};
    const msgs = Array.isArray(v.messages) ? v.messages : [];
    for (const m of msgs) {
      if (!m || m.type !== 'text' || !m.text || !m.text.body) continue;
      const from = String(m.from || '').replace(/\\D/g, '');
      const own = String(meta.display_phone_number || '').replace(/\\D/g, '');
      if (!from || !meta.phone_number_id || from === own) continue;
      const tsMs = Number(m.timestamp || 0) * 1000;
      if (tsMs && (Date.now() - tsMs) / 3600000 > windowHours) continue;
      const contacts = Array.isArray(v.contacts) ? v.contacts : [];
      const contact = contacts.find(c => String(c.wa_id) === from) || contacts[0] || {};
      const text = String(m.text.body).trim().slice(0, 3000);
      if (!text) continue;
      const context = m.context || {};
      const quotedId = String(context.id || '');
      out.push({ json: {
        phone_number_id: String(meta.phone_number_id),
        display_phone_number: own,
        customer_phone: from,
        customer_name: (contact.profile && contact.profile.name) || '',
        message_id: String(m.id || ''),
        quoted_message_id: quotedId || null,
        message_text: text,
        message_timestamp: tsMs ? new Date(tsMs).toISOString() : new Date().toISOString(),
        session_id: String(meta.phone_number_id) + ':' + from,
        received_epoch: Date.now(),
      } });
    }
  }
}
return out.filter(o => o.json.message_id).slice(0, 1);`;

// 2. Update 'Check Duplicates'
const checkDup = wf.nodes.find(n => n.name === 'Check Duplicates');
checkDup.parameters.fieldsUi.fieldValues = [
  { fieldId: "wa_message_id", fieldValue: "={{ $json.message_id }}" },
  { fieldId: "direction", fieldValue: "inbound" },
  { fieldId: "session_id", fieldValue: "={{ $json.session_id }}" },
  { fieldId: "phone_number_id", fieldValue: "={{ $json.phone_number_id }}" },
  { fieldId: "customer_phone", fieldValue: "={{ $json.customer_phone }}" },
  { fieldId: "customer_name", fieldValue: "={{ $json.customer_name }}" },
  { fieldId: "body", fieldValue: "={{ $json.message_text }}" },
  { fieldId: "message_id", fieldValue: "={{ $json.message_id }}" },
  { fieldId: "message_timestamp", fieldValue: "={{ $json.message_timestamp }}" },
  { fieldId: "status", fieldValue: "received" },
  { fieldId: "metadata", fieldValue: "={{ ({ quoted_message_id: $json.quoted_message_id, epoch: $json.received_epoch }) }}" }
];

// 3. Create Aggregation & Quoted Reply Nodes
const debounceWaitNode = {
  id: "deb-wait-01",
  name: "Debounce Quiet Window",
  type: "n8n-nodes-base.wait",
  typeVersion: 1.1,
  position: [920, 200],
  parameters: {
    amount: 3.5,
    unit: "seconds"
  }
};

const fetchBufferNode = {
  id: "fetch-buf-02",
  name: "Fetch Recent Messages",
  type: "n8n-nodes-base.supabase",
  typeVersion: 1,
  position: [1120, 200],
  credentials: {
    supabaseOAuth2Api: {
      id: "hhGIFErxGSNsrbbc",
      name: "Supabase account"
    }
  },
  parameters: {
    authentication: "oAuth2",
    operation: "getAll",
    projectRef: "rjcdzlqspauyqzqtmwcq",
    tableId: "wa_messages",
    limit: 10,
    orderBy: "created_at.desc",
    matchType: "allFilters",
    filters: {
      conditions: [
        {
          keyName: "session_id",
          condition: "eq",
          keyValue: "={{ $('Validate Message').first().json.session_id }}"
        },
        {
          keyName: "direction",
          condition: "eq",
          keyValue: "inbound"
        }
      ]
    }
  }
};

const aggregateNode = {
  id: "agg-code-03",
  name: "Aggregate & Check Winner",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1340, 200],
  parameters: {
    jsCode: `const orig = $('Validate Message').first().json;
const rows = $input.all().map(i => i.json).filter(r => r && r.body && r.direction === 'inbound');

if (!rows.length) {
  return [{ json: { should_process: true, ...orig, combined_text: orig.message_text, batch_count: 1, batch_message_ids: [orig.message_id] } }];
}

// Sort oldest first
const sorted = rows.sort((a, b) => new Date(a.created_at || a.message_timestamp) - new Date(b.created_at || b.message_timestamp));

// The newest message in this batch
const newest = sorted[sorted.length - 1];
const newestId = String(newest.message_id || newest.wa_message_id || '');
const currentId = String(orig.message_id || '');

// Check 1: If another message arrived after this one, this execution yields
if (currentId && newestId && currentId !== newestId) {
  return [{ json: { should_process: false, reason: 'superseded_by_newer_message', current_id: currentId, newest_id: newestId } }];
}

// Check 2: Check elapsed time since newest message
const newestTime = new Date(newest.created_at || newest.message_timestamp).getTime();
const msSinceNewest = Date.now() - newestTime;
if (msSinceNewest < 2500) {
  return [{ json: { should_process: false, reason: 'quiet_window_active', msSinceNewest } }];
}

// Winner! Combine messages from recent burst (received within last 60 seconds)
const cutoff = Date.now() - 60000;
const recentBurst = sorted.filter(m => new Date(m.created_at || m.message_timestamp).getTime() >= cutoff);
const batch = recentBurst.length ? recentBurst : [newest];

const combinedText = batch.map(m => String(m.body).trim()).filter(Boolean).join('\\n').slice(0, 3000);

// Extract latest quoted_message_id if any message in batch had one
let quotedMsgId = orig.quoted_message_id || null;
for (let i = batch.length - 1; i >= 0; i--) {
  const m = batch[i];
  let meta = m.metadata;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
  if (m.quoted_message_id) { quotedMsgId = m.quoted_message_id; break; }
  if (meta && meta.quoted_message_id) { quotedMsgId = meta.quoted_message_id; break; }
}

return [{ json: {
  should_process: true,
  phone_number_id: orig.phone_number_id,
  display_phone_number: orig.display_phone_number,
  customer_phone: orig.customer_phone,
  customer_name: orig.customer_name,
  session_id: orig.session_id,
  message_id: newestId || currentId,
  message_text: combinedText || orig.message_text,
  original_single_text: orig.message_text,
  batch_count: batch.length,
  batch_message_ids: batch.map(b => b.message_id || b.wa_message_id),
  quoted_message_id: quotedMsgId,
  message_timestamp: newest.message_timestamp || orig.message_timestamp,
} }];`
  }
};

const shouldProcessNode = {
  id: "sp-if-04",
  name: "Should Process Batch?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [1560, 200],
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "loose",
        version: 2
      },
      conditions: [
        {
          id: "sp_cond",
          leftValue: "={{ $json.should_process }}",
          rightValue: "",
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true
          }
        }
      ],
      combinator: "and"
    }
  }
};

const hasQuotedNode = {
  id: "has-quoted-05",
  name: "Has Quoted Message?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [1780, 200],
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "loose",
        version: 2
      },
      conditions: [
        {
          id: "hq_cond",
          leftValue: "={{ !!$json.quoted_message_id }}",
          rightValue: "",
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true
          }
        }
      ],
      combinator: "and"
    }
  }
};

const fetchQuotedNode = {
  id: "fetch-quoted-06",
  name: "Fetch Quoted Message",
  type: "n8n-nodes-base.supabase",
  typeVersion: 1,
  position: [2000, 100],
  onError: "continueRegularOutput",
  credentials: {
    supabaseOAuth2Api: {
      id: "hhGIFErxGSNsrbbc",
      name: "Supabase account"
    }
  },
  parameters: {
    authentication: "oAuth2",
    operation: "getAll",
    projectRef: "rjcdzlqspauyqzqtmwcq",
    tableId: "wa_messages",
    limit: 1,
    matchType: "allFilters",
    filters: {
      conditions: [
        {
          keyName: "wa_message_id",
          condition: "eq",
          keyValue: "={{ $('Aggregate & Check Winner').first().json.quoted_message_id }}"
        }
      ]
    }
  }
};

const resolveQuotedDataNode = {
  id: "res-quoted-07",
  name: "Resolve Quoted Data",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2220, 100],
  parameters: {
    jsCode: `const prev = $('Aggregate & Check Winner').first().json;
const rows = $input.all().map(i => i.json).filter(r => r && r.body);
let quotedText = '';
let quotedMetadata = {};
if (rows.length) {
  quotedText = rows[0].body || '';
  quotedMetadata = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata || '{}') : (rows[0].metadata || {});
}
return [{ json: {
  ...prev,
  quoted_found: !!quotedText,
  quoted_body: quotedText,
  quoted_metadata: quotedMetadata,
} }];`
  }
};

const passDirectNode = {
  id: "pass-dir-08",
  name: "Pass Direct Message",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2000, 300],
  parameters: {
    jsCode: `const prev = $('Aggregate & Check Winner').first().json;
return [{ json: {
  ...prev,
  quoted_found: false,
  quoted_body: '',
  quoted_metadata: {},
} }];`
  }
};

// 4. Update 'Identify Business' to take input from Quoted resolution or direct pass
const identifyBiz = wf.nodes.find(n => n.name === 'Identify Business');
identifyBiz.position = [2460, 200];
identifyBiz.parameters.filters.conditions[0].keyValue = "={{ $json.phone_number_id }}";

// 5. Update 'Resolve Business'
const resolveBiz = wf.nodes.find(n => n.name === 'Resolve Business');
resolveBiz.position = [2680, 200];
resolveBiz.parameters.jsCode = `const cfg = $('Workflow Config').first().json;
const inItem = $input.first().json;
const bizRows = $('Identify Business').all().map(i => i.json).filter(r => r && r.id);
let business = null;
let source = 'none';
if (bizRows.length) {
  business = bizRows[0];
  source = 'supabase';
} else if (cfg.test_mode === true && (!cfg.test_phone_number_id || String(cfg.test_phone_number_id) === String(inItem.phone_number_id))) {
  business = {
    id: cfg.test_business_id || 'biz_test',
    name: cfg.test_business_name,
    phone_number_id: inItem.phone_number_id,
    services: cfg.test_services,
    products: '',
    prices: '',
    faqs: cfg.test_faqs,
    opening_hours: cfg.test_opening_hours,
    ai_tone: cfg.test_ai_tone,
    contact_details: cfg.test_contact_details,
    booking_system: null,
    handoff_message: '',
  };
  source = 'test_config';
}
return [{ json: {
  ...inItem,
  business_found: !!business,
  business_source: source,
  business: business || {},
} }];`;

// 6. Update 'Business Known?'
const bizKnown = wf.nodes.find(n => n.name === 'Business Known?');
bizKnown.position = [2900, 200];

// Shift downstream nodes
const fetchBizData = wf.nodes.find(n => n.name === 'Fetch Business Data');
fetchBizData.position = [3120, 100];

const logUnknownBiz = wf.nodes.find(n => n.name === 'Log Unknown Business');
logUnknownBiz.position = [3120, 320];

const fetchLead = wf.nodes.find(n => n.name === 'Fetch Existing Lead');
fetchLead.position = [3340, 100];
fetchLead.parameters.filters.conditions[1].keyValue = "={{ $('Resolve Business').first().json.customer_phone }}";

const retHist = wf.nodes.find(n => n.name === 'Retrieve Chat History');
retHist.position = [3560, 100];
retHist.parameters.filters.conditions = [
  {
    keyName: "session_id",
    condition: "eq",
    keyValue: "={{ $('Resolve Business').first().json.session_id }}"
  }
];

const checkHuman = wf.nodes.find(n => n.name === 'Check Human Takeover');
checkHuman.position = [3780, 100];
checkHuman.parameters.filters.conditions[0].keyValue = "={{ $('Resolve Business').first().json.session_id }}";

// 7. Update 'Build AI Context'
const buildAiCtx = wf.nodes.find(n => n.name === 'Build AI Context');
buildAiCtx.position = [4000, 100];
buildAiCtx.parameters.jsCode = `const cfg = $('Workflow Config').first().json;
const msg = $('Resolve Business').first().json;
const biz = msg.business || {};
let settings = biz.settings;
if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) { settings = {}; } }
if (!settings || typeof settings !== 'object') settings = {};
const clean = items => items.map(i => i.json).filter(r => r && typeof r === 'object' && Object.keys(r).length > 0 && !r.error);
const parseMeta = m => { if (m && typeof m === 'object') return m; try { return JSON.parse(m || '{}') || {}; } catch (e) { return {}; } };
const styles = clean($('Fetch Business Data').all());
const lead = clean($('Fetch Existing Lead').all())[0] || null;
const conv = clean($('Check Human Takeover').all())[0] || null;

// History: only this session, successful rows, oldest first
const hist = clean($('Retrieve Chat History').all())
  .filter(r => r.body && r.wa_message_id !== msg.message_id && r.message_id !== msg.message_id)
  .filter(r => String(r.session_id) === String(msg.session_id))
  .filter(r => r.status !== 'failed')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const lastAt = hist.length ? new Date(hist[hist.length - 1].created_at).getTime() : 0;
const hoursSinceLast = lastAt ? (Date.now() - lastAt) / 3600000 : null;
const isNewConversation = !hist.length || hoursSinceLast > 12;
const outbound = hist.filter(r => r.direction === 'outbound');
const historyText = hist.slice(-8).map(r => (r.direction === 'inbound' ? 'Customer: ' : 'You (sales assistant): ') + String(r.body).slice(0, 400)).join('\\n');

// Human handoff: only if explicitly active on conversation in database
const handoffActive = !!(conv && (conv.human_takeover === true || conv.human_takeover === 'true'));

// Business info from columns OR businesses.settings JSON
const has = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const pick = (...keys) => { for (const k of keys) { if (has(biz[k])) return biz[k]; if (has(settings[k])) return settings[k]; } return null; };
const fmt = v => !has(v) ? 'Not provided' : (typeof v === 'string' ? v : JSON.stringify(v));
const known = ['name','description','about','services','products','prices','pricing','faqs','opening_hours','hours','location','address','contact_details','contact','policies','ai_tone','tone','booking_system','handoff_message','language','owner_phone','owner_name'];
const extra = {};
for (const k of Object.keys(settings)) { if (!known.includes(k) && !/key|token|secret|password/i.test(k)) extra[k] = settings[k]; }

const businessContext = [
  'Business Name: ' + fmt(biz.name),
  'About: ' + fmt(pick('description', 'about')),
  'Verified Properties & Overview: ' + fmt(pick('services')),
  'Indicative Price Range: ' + fmt(pick('prices', 'pricing')),
  'Frequently Asked Questions: ' + fmt(pick('faqs')),
  'Visiting / Office Hours: ' + fmt(pick('opening_hours', 'hours')),
  'Location & Projects: ' + fmt(pick('location', 'address')),
  'Contact Details: ' + fmt(pick('contact_details', 'contact')),
  Object.keys(extra).length ? 'Other verified info: ' + JSON.stringify(extra).slice(0, 1500) : '',
  has(biz.system_prompt) ? 'Developer/Consultant Instructions: ' + String(biz.system_prompt).slice(0, 2000) : '',
].filter(Boolean).join('\\n');

// Quoted context
let quotedContext = '';
if (msg.quoted_found && msg.quoted_body) {
  quotedContext = 'QUOTED / REFERENCED MESSAGE CONTEXT:\\nThe customer specifically replied to this earlier message:\\n"' + msg.quoted_body + '"\\nIMPORTANT: Answer the customer\\'s question with respect to this specific property / detail!\\n';
}

// Short message guidance
const textTrim = String(msg.message_text || '').trim();
const isShort = textTrim.length <= 4 || /^(yes|haan|ha|theek hai|ok|okay|\\.|\\?|details|send|price)$/i.test(textTrim);
let shortMsgGuidance = '';
if (isShort) {
  shortMsgGuidance = 'SHORT MESSAGE NOTE: The customer sent a very short message ("' + textTrim + '").\\n- If it refers to an earlier question you asked, interpret it in context (e.g. if you asked ready-to-move vs under-construction, interpret "yes" or "ha" accordingly).\\n- If it is "." or "?" without clear meaning, do NOT interpret it as confirmation. Politely ask a 1-sentence clarification: "Ji, bataiye main aapki property search mein kya help kar sakta hoon?"';
}

// Structured lead memory
const leadKnown = lead ? [
  'Customer Name: ' + fmt(lead.customer_name || msg.customer_name),
  'Interested Property: ' + fmt(lead.interested_service),
  'Preferred Location/Project: ' + fmt(lead.location),
  'Budget: ' + fmt(lead.budget),
  'Known Requirements: ' + fmt(lead.requirements),
  'Preferred Visit/Call Time: ' + fmt(lead.preferred_appointment_time),
  'Status: ' + fmt(lead.status),
].join('\\n') : 'No saved lead details yet. WhatsApp profile name: ' + fmt(msg.customer_name);

const ownerPhone = pick('owner_phone') || cfg.owner_phone || '917250307422';
const ownerName = pick('owner_name') || 'Sanskar Sharma';

return [{ json: {
  ...msg,
  business_id: String(biz.id || ''),
  business_name: biz.name || '',
  owner_phone: String(ownerPhone).replace(/\\D/g, ''),
  owner_name: ownerName,
  ai_tone: pick('ai_tone', 'tone') || 'Warm, natural, conversational, polite, concise Indian real estate assistant',
  handoff_message: pick('handoff_message') || '',
  business_context: businessContext,
  quoted_context: quotedContext,
  short_message_guidance: shortMsgGuidance,
  lead_known: leadKnown,
  existing_lead: lead || {},
  history_text: historyText,
  history_count: hist.length,
  assistant_turns: outbound.length,
  is_new_conversation: isNewConversation,
  human_takeover: handoffActive,
} }];`;

// 8. Update 'Bot Active?'
const botActive = wf.nodes.find(n => n.name === 'Bot Active?');
botActive.position = [4220, 100];

const humanNoReply = wf.nodes.find(n => n.name === 'Human Handling - No Auto Reply');
humanNoReply.position = [4220, 300];

// 9. Update 'AI Agent' system prompt and input
const aiAgent = wf.nodes.find(n => n.name === 'AI Agent');
aiAgent.position = [4440, 100];
aiAgent.parameters.text = `=Conversation status: {{ $json.is_new_conversation ? "NEW conversation - greet warmly once." : "ONGOING conversation (" + $json.assistant_turns + " earlier replies) - do NOT greet again, continue naturally." }}

Recent chat history (oldest first):
{{ $json.history_text || "(no earlier messages)" }}

{{ $json.quoted_context || "" }}
{{ $json.short_message_guidance || "" }}

Customer wrote:
{{ $json.message_text }}`;

aiAgent.parameters.options.systemMessage = `=You are the professional, friendly WhatsApp real estate sales assistant for {{ $json.business_name || "Amolik Housing" }}.

GOAL: Help customers with genuine property inquiries in Faridabad and connect them with the sales consultant or coordinate a site visit.

CORE CONVERSATION STYLE (STRICT RULES):
1. NATURAL & CONCISE: Default to 2–3 short, natural sentences per response. Never write long paragraphs or copy-paste property database lists.
2. LANGUAGE:
   - When the customer writes in Hindi or Hinglish, reply in warm, conversational Indian Hinglish (e.g. "Haanji! Aapke budget mein Amolik Park ka 3 BHK option check kar sakte hain. Aapko ready-to-move flat chahiye ya under-construction bhi chalega?").
   - When the customer writes in English, reply in clean, natural English.
3. ANSWER EXACT QUESTION FIRST: Always answer the customer's specific question before anything else.
4. ONLY RELEVANT INFO: Include only the most relevant property information. Do not list every project, amenity, or floor size in every response.
5. AT MOST ONE FOLLOW-UP QUESTION: Ask at most ONE helpful follow-up question per turn to understand their BHK, budget, possession timeline, or visit plan.
6. NO REPETITIVE NAME GREETINGS: Do NOT greet the customer by name on every message (avoid saying "Haanji Sanskar", "Hello Sanskar" repeatedly). Greet naturally only in the first turn of a new conversation.
7. NEVER INVENT: Never invent property prices, availability, or specifications. Use ONLY the verified BUSINESS INFORMATION below. If information is missing, state politely that it needs to be verified with our consultant.
8. NO FILE ATTACHMENT PROMISES: You cannot directly send PDF files or attachments. If asked for floor plans/payment plans/brochure, explain warmly that our property consultant will share them on WhatsApp or call.
9. APPOINTMENTS & CALL REQUESTS:
   - If customer asks to talk to the owner/manager or asks for a callback:
     Say warmly: "Bilkul! Maine property consultant / owner ko notify kar diya hai ki aap call par baat karna chahte hain. Wo jald hi aapse connect karenge."
     Set: handoff_required=true, handoff_reason="Customer requested a phone call / talk with owner"
   - If customer asks for a site visit:
     Ask for their convenient day/time (e.g. weekend or weekday morning/afternoon). Once shared, confirm that the consultant will confirm the slot and set appointment_requested=true.

BUSINESS INFORMATION (SOURCE OF TRUTH):
{{ $json.business_context }}

KNOWN CUSTOMER REQUIREMENTS:
{{ $json.lead_known }}`;

// 10. Update OpenAI Model and Structured Parser positions
const openAiModel = wf.nodes.find(n => n.name === 'OpenAI Chat Model');
openAiModel.position = [4440, 320];

const structuredParser = wf.nodes.find(n => n.name === 'Structured Reply Parser');
structuredParser.position = [4600, 320];
structuredParser.parameters.jsonSchemaExample = JSON.stringify({
  reply: "Haanji! Aapke budget mein Amolik Park ka 3 BHK option check kar sakte hain. Aapko ready-to-move flat chahiye ya under-construction bhi chalega?",
  language: "hinglish",
  intent: "property_inquiry",
  handoff_required: false,
  handoff_reason: "",
  customer_name: "",
  interested_service: "Amolik Park View",
  preferred_bhk: "3 BHK",
  preferred_location: "Sector 84, Amolik Park View",
  budget: "70 Lakh",
  possession_preference: "ready_to_move",
  requirements: "3 BHK within 70 Lakh budget in Amolik Park",
  preferred_appointment_time: "",
  appointment_requested: false
}, null, 2);

// 11. Update 'AI Failure Fallback' and 'Prepare Updates'
const aiFallback = wf.nodes.find(n => n.name === 'AI Failure Fallback');
aiFallback.position = [4760, 220];

const prepareUpdates = wf.nodes.find(n => n.name === 'Prepare Updates');
prepareUpdates.position = [4980, 100];
prepareUpdates.parameters.jsCode = `const ctx = $('Build AI Context').first().json;
const raw = $input.first().json || {};
const aiFailed = raw.ai_failed === true;
let ai = raw.output !== undefined ? raw.output : raw;
if (typeof ai === 'string') {
  try { ai = JSON.parse(ai.replace(/^\\s*\`\`\`(json)?/i, '').replace(/\`\`\`\\s*$/, '')); } catch (e) { ai = { reply: ai }; }
}
if (!ai || typeof ai !== 'object') ai = {};
const str = v => (v === null || v === undefined) ? '' : String(v).trim();
const now = new Date().toISOString();

// Human handoff detection
const humanRegex = /(\\bhuman\\b|\\bagent\\b|representative|real person|\\bmanager\\b|\\bowner\\b|\\binsaan\\b|\\binsan\\b|staff se baat|kisi se baat|call me|call karo|phone karo|baat karni hai|इंसान|मैनेजर)/i;
const customerAskedHuman = humanRegex.test(ctx.message_text || '');
const handoff = aiFailed || ai.handoff_required === true || customerAskedHuman;
const handoffReason = aiFailed ? ('AI error: ' + str(raw.error_message))
  : (customerAskedHuman && !ai.handoff_required ? 'Customer requested a call / human representative' : str(ai.handoff_reason) || (handoff ? 'AI could not answer safely' : ''));

const msgText = String(ctx.message_text || '');
const hasDeva = /[\\u0900-\\u097F]/.test(msgText);
let lang = str(ai.language).toLowerCase();
if (lang === 'hindi' && !hasDeva) lang = 'hinglish';
lang = lang || (hasDeva ? 'hindi' : (/(\\bhai\\b|\\bhain\\b|\\bkya\\b|\\bnahi\\b|\\bchahiye\\b|\\bkab\\b|\\bkitna\\b|\\baap\\b)/i.test(msgText) ? 'hinglish' : 'english'));

const fallbackByLang = {
  hindi: 'धन्यवाद! हमारी टीम का कोई सदस्य जल्द ही यहीं आपको जवाब देगा।',
  hinglish: 'Thank you! Hamari team ka member jald hi aapse yahan connect karega.',
  english: 'Thank you! A member of our team will reply to you here shortly.',
};
const defaultHandoff = fallbackByLang[lang] || fallbackByLang.english;
let reply = str(ai.reply);
if (handoff && !reply) reply = str(ctx.handoff_message) || defaultHandoff;
if (!reply) reply = str(ctx.handoff_message) || defaultHandoff;
reply = reply.slice(0, 4000);

// Merge lead fields without overwriting known values with blanks
const ex = ctx.existing_lead || {};
const pick = (n, o) => str(n) ? str(n) : (str(o) || null);

const lead = {
  business_id: ctx.business_id,
  customer_phone: ctx.customer_phone,
  customer_name: pick(ai.customer_name, ex.customer_name || ctx.customer_name),
  interested_service: pick(ai.interested_service, ex.interested_service),
  requirements: pick(ai.requirements, ex.requirements),
  budget: pick(ai.budget, ex.budget),
  location: pick(ai.preferred_location, ex.location),
  preferred_appointment_time: pick(ai.preferred_appointment_time, ex.preferred_appointment_time),
  last_intent: str(ai.intent) || null,
  last_message_at: now,
  updated_at: now,
};

let status = 'new';
if (lead.interested_service || lead.budget || lead.location) status = 'interested';
if (lead.customer_name && lead.interested_service && (lead.requirements || lead.budget || lead.preferred_appointment_time)) status = 'qualified';
if (handoff) status = 'follow_up_required';
lead.status = status;

const apptRequested = !aiFailed && ai.appointment_requested === true;

// Owner Notification Message
const ownerPhone = String(ctx.owner_phone || '917250307422').replace(/\\D/g, '');
const custName = lead.customer_name || ctx.customer_name || 'Customer';
const custPhone = ctx.customer_phone;

let ownerAlertText = '';
if (apptRequested) {
  ownerAlertText = \`🔔 *New Site Visit Request!*
👤 *Customer:* \${custName}
📱 *Phone:* +\${custPhone}
🏠 *Property / Requirement:* \${lead.interested_service || lead.requirements || 'Property Inquiry'}
📍 *Location:* \${lead.location || 'Faridabad'}
💰 *Budget:* \${lead.budget || 'Not specified'}
⏰ *Preferred Time:* \${lead.preferred_appointment_time || 'Customer requested visit coordination'}
💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"
👉 *Action:* Please call the customer to confirm the visit schedule!\`;
} else if (handoff) {
  ownerAlertText = \`📞 *Customer Requested Call / Consultant Support!*
👤 *Customer:* \${custName}
📱 *Phone:* +\${custPhone}
❓ *Reason:* \${handoffReason || 'Customer requested phone discussion'}
🏠 *Discussed:* \${lead.interested_service || lead.requirements || 'General Inquiry'}
💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"
👉 *Action:* Please call customer back at +\${custPhone}.\`;
}

const shouldNotifyOwner = !!(ownerAlertText && ownerPhone);

return [{ json: {
  business_id: ctx.business_id,
  business_name: ctx.business_name,
  phone_number_id: ctx.phone_number_id,
  customer_phone: ctx.customer_phone,
  session_id: ctx.session_id,
  inbound_message_id: ctx.message_id,
  batch_message_ids: ctx.batch_message_ids || [ctx.message_id],
  reply_text: reply,
  language: lang,
  customer_name: lead.customer_name || ctx.customer_name || '',
  intent: str(ai.intent),
  ai_failed: aiFailed,
  handoff: handoff,
  handoff_reason: handoffReason,
  appointment_requested: apptRequested,
  notify_owner: shouldNotifyOwner,
  owner_phone: ownerPhone,
  owner_alert_text: ownerAlertText,
  lead_status: status,
  lead_payload: lead,
  conversation_payload: {
    session_id: ctx.session_id,
    business_id: ctx.business_id,
    phone_number_id: ctx.phone_number_id,
    customer_phone: ctx.customer_phone,
    customer_name: lead.customer_name,
    human_takeover: handoff,
    status: 'open',
    last_message: reply.slice(0, 500),
    last_inbound_at: ctx.message_timestamp,
    last_message_at: now,
    updated_at: now,
  },
} }];`;

// 12. Update downstream database save and WhatsApp reply positions
const updateConv = wf.nodes.find(n => n.name === 'Update Conversation');
updateConv.position = [5200, 100];

const updateLead = wf.nodes.find(n => n.name === 'Update Lead');
updateLead.position = [5420, 100];

const apptReq = wf.nodes.find(n => n.name === 'Appointment Requested?');
apptReq.position = [5640, 100];

const saveAppt = wf.nodes.find(n => n.name === 'Save Appointment Request');
saveAppt.position = [5860, 40];

const handoffReq = wf.nodes.find(n => n.name === 'Handoff Needed?');
handoffReq.position = [6080, 100];

const recordEsc = wf.nodes.find(n => n.name === 'Record Escalation');
recordEsc.position = [6300, 40];

const recordsSaved = wf.nodes.find(n => n.name === 'Records Saved');
recordsSaved.position = [6520, 100];

const sendWaReply = wf.nodes.find(n => n.name === 'Send WhatsApp Reply');
sendWaReply.position = [5200, 260];

const logResult = wf.nodes.find(n => n.name === 'Log Result');
logResult.position = [5420, 260];
// Update Log Result metadata to store batch IDs
const lrMetadata = logResult.parameters.fieldsUi.fieldValues.find(f => f.fieldId === 'metadata');
if (lrMetadata) {
  lrMetadata.fieldValue = `={{ ({ business_id: $("Prepare Updates").first().json.business_id, business_name: $("Prepare Updates").first().json.business_name, in_reply_to: $("Prepare Updates").first().json.inbound_message_id, batch_message_ids: $("Prepare Updates").first().json.batch_message_ids, intent: $("Prepare Updates").first().json.intent, language: $("Prepare Updates").first().json.language, lead_status: $("Prepare Updates").first().json.lead_status, handoff: $("Prepare Updates").first().json.handoff, handoff_reason: $("Prepare Updates").first().json.handoff_reason, appointment_requested: $("Prepare Updates").first().json.appointment_requested, ai_failed: $("Prepare Updates").first().json.ai_failed }) }}`;
}

const logSendFailure = wf.nodes.find(n => n.name === 'Log Send Failure');
logSendFailure.position = [5420, 420];

const notifyOwner = wf.nodes.find(n => n.name === 'Notify Owner?');
notifyOwner.position = [5640, 260];

const sendWaOwner = wf.nodes.find(n => n.name === 'Send WhatsApp to Owner');
sendWaOwner.position = [5860, 260];

// Add the 7 new nodes to wf.nodes
wf.nodes.push(
  debounceWaitNode,
  fetchBufferNode,
  aggregateNode,
  shouldProcessNode,
  hasQuotedNode,
  fetchQuotedNode,
  resolveQuotedDataNode,
  passDirectNode
);

// 13. Re-wire connections
// Check Duplicates -> Debounce Quiet Window (instead of Identify Business)
wf.connections["Check Duplicates"].main[0] = [
  { node: "Debounce Quiet Window", type: "main", index: 0 }
];

// Debounce Quiet Window -> Fetch Recent Messages
wf.connections["Debounce Quiet Window"] = {
  main: [
    [
      { node: "Fetch Recent Messages", type: "main", index: 0 }
    ]
  ]
};

// Fetch Recent Messages -> Aggregate & Check Winner
wf.connections["Fetch Recent Messages"] = {
  main: [
    [
      { node: "Aggregate & Check Winner", type: "main", index: 0 }
    ]
  ]
};

// Aggregate & Check Winner -> Should Process Batch?
wf.connections["Aggregate & Check Winner"] = {
  main: [
    [
      { node: "Should Process Batch?", type: "main", index: 0 }
    ]
  ]
};

// Should Process Batch?:
// index 0 (true): -> Has Quoted Message?
// index 1 (false): -> Duplicate or DB Error - Stop
wf.connections["Should Process Batch?"] = {
  main: [
    [
      { node: "Has Quoted Message?", type: "main", index: 0 }
    ],
    [
      { node: "Duplicate or DB Error - Stop", type: "main", index: 0 }
    ]
  ]
};

// Has Quoted Message?:
// index 0 (true): -> Fetch Quoted Message
// index 1 (false): -> Pass Direct Message
wf.connections["Has Quoted Message?"] = {
  main: [
    [
      { node: "Fetch Quoted Message", type: "main", index: 0 }
    ],
    [
      { node: "Pass Direct Message", type: "main", index: 0 }
    ]
  ]
};

// Fetch Quoted Message -> Resolve Quoted Data
wf.connections["Fetch Quoted Message"] = {
  main: [
    [
      { node: "Resolve Quoted Data", type: "main", index: 0 }
    ]
  ]
};

// Resolve Quoted Data -> Identify Business
wf.connections["Resolve Quoted Data"] = {
  main: [
    [
      { node: "Identify Business", type: "main", index: 0 }
    ]
  ]
};

// Pass Direct Message -> Identify Business
wf.connections["Pass Direct Message"] = {
  main: [
    [
      { node: "Identify Business", type: "main", index: 0 }
    ]
  ]
};

// Save updated workflow JSON
const targetFile = '/Users/sanskar/whatspp automation trail/whatsapp-automation-trail/workflows/whatsapp_multi_client_ai.json';
fs.writeFileSync(targetFile, JSON.stringify(wf, null, 2), 'utf8');
console.log('Saved updated workflow with', wf.nodes.length, 'nodes to', targetFile);
