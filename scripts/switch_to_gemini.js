const fs = require('fs');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjZkOGY5Mi1jMzQ5LTQ1NWUtOWQ2MS01MWU3NjczYTY1NzUiLCJpc3MiOiJuOG4iLCJqdGkiOiIyNDQ5OTlkYS0yZmIzLTRjY2UtOGI4Ny05OGM3OTlmMDgzNzkiLCJpYXQiOjE3OTI1MTE4MzQsImF1ZCI6Im1jcC1zZXJ2ZXItYXBpIn0.G64W-Qbu2nr0dOivFmXOmDItxTNM_IJWamdwjDWLCFk';

// Build operations to switch model to Google Gemini 1.5 Flash and optimize token consumption
const operations = [
  // 1. Remove connection from OpenAI Chat Model to AI Agent
  {
    type: 'removeConnection',
    source: 'OpenAI Chat Model',
    target: 'AI Agent',
    connectionType: 'ai_languageModel',
    sourceIndex: 0,
    targetIndex: 0
  },
  // 2. Remove OpenAI Chat Model node
  {
    type: 'removeNode',
    nodeName: 'OpenAI Chat Model'
  },
  // 3. Add Google Gemini Chat Model node (gemini-1.5-flash, maxOutputTokens: 350)
  {
    type: 'addNode',
    node: {
      name: 'Google Gemini Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      typeVersion: 1.2,
      position: [4440, 320],
      parameters: {
        modelName: 'models/gemini-1.5-flash',
        options: {
          maxOutputTokens: 350,
          temperature: 0.3
        }
      }
    }
  },
  // 4. Connect Google Gemini Chat Model to AI Agent
  {
    type: 'addConnection',
    source: 'Google Gemini Chat Model',
    target: 'AI Agent',
    connectionType: 'ai_languageModel',
    sourceIndex: 0,
    targetIndex: 0
  },
  // 5. Update Build AI Context to optimize token usage
  {
    type: 'updateNodeParameters',
    nodeName: 'Build AI Context',
    parameters: {
      jsCode: `const cfg = $('Workflow Config').first().json;
const msg = $('Resolve Business').first().json;
const biz = msg.business || {};
let settings = biz.settings;
if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) { settings = {}; } }
if (!settings || typeof settings !== 'object') settings = {};
const clean = items => items.map(i => i.json).filter(r => r && typeof r === 'object' && Object.keys(r).length > 0 && !r.error);
const lead = clean($('Fetch Existing Lead').all())[0] || null;
const conv = clean($('Check Human Takeover').all())[0] || null;

// History: token-optimized, last 4 turns only, oldest first
const hist = clean($('Retrieve Chat History').all())
  .filter(r => r.body && r.wa_message_id !== msg.message_id && r.message_id !== msg.message_id)
  .filter(r => String(r.session_id) === String(msg.session_id))
  .filter(r => r.status !== 'failed')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const lastAt = hist.length ? new Date(hist[hist.length - 1].created_at).getTime() : 0;
const hoursSinceLast = lastAt ? (Date.now() - lastAt) / 3600000 : null;
const isNewConversation = !hist.length || hoursSinceLast > 12;
const outbound = hist.filter(r => r.direction === 'outbound');
// Max 4 recent messages, compact snippet to save tokens
const historyText = hist.slice(-4).map(r => (r.direction === 'inbound' ? 'Customer: ' : 'Assistant: ') + String(r.body).slice(0, 250)).join('\\n');

// Human handoff: only if explicitly active in database
const handoffActive = !!(conv && (conv.human_takeover === true || conv.human_takeover === 'true'));

// Business info: compact and token-efficient
const has = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const pick = (...keys) => { for (const k of keys) { if (has(biz[k])) return biz[k]; if (has(settings[k])) return settings[k]; } return null; };
const fmt = v => !has(v) ? 'Not provided' : (typeof v === 'string' ? v : JSON.stringify(v));

const businessContext = [
  'Business: ' + fmt(biz.name),
  'Properties: ' + fmt(pick('services')),
  'Prices: ' + fmt(pick('prices', 'pricing')),
  'FAQs: ' + fmt(pick('faqs')),
  'Hours: ' + fmt(pick('opening_hours', 'hours')),
  'Location: ' + fmt(pick('location', 'address')),
  'Contact: ' + fmt(pick('contact_details', 'contact')),
].filter(Boolean).join('\\n');

// Quoted context
let quotedContext = '';
if (msg.quoted_found && msg.quoted_body) {
  quotedContext = 'QUOTED MESSAGE CONTEXT:\\nCustomer replied to: "' + msg.quoted_body.slice(0, 300) + '"\\n(Answer specifically about this property/detail!)\\n';
}

// Short message guidance
const textTrim = String(msg.message_text || '').trim();
const isShort = textTrim.length <= 4 || /^(yes|haan|ha|theek hai|ok|okay|\\.|\\?|details|send|price)$/i.test(textTrim);
let shortMsgGuidance = '';
if (isShort) {
  shortMsgGuidance = 'SHORT MESSAGE NOTE: Customer sent "' + textTrim + '". Interpret in context of previous question or ask 1 brief clarification.';
}

// Structured lead memory
const leadKnown = lead ? [
  'Customer: ' + fmt(lead.customer_name || msg.customer_name),
  'Property: ' + fmt(lead.interested_service),
  'Location: ' + fmt(lead.location),
  'Budget: ' + fmt(lead.budget),
  'Requirements: ' + fmt(lead.requirements),
  'Visit/Call Time: ' + fmt(lead.preferred_appointment_time),
].join('\\n') : 'No saved lead details yet.';

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
} }];`
    }
  }
];

const rpcBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'update_workflow',
    arguments: {
      workflowId: 'FjdX8g9eDzTtx1Dc',
      versionName: 'Switch to Google Gemini 1.5 Flash (Ultra-low cost & token optimized)',
      versionDescription: 'Switched LLM from OpenAI gpt-4o-mini to Google Gemini 1.5 Flash. Optimized prompt context to 4 history turns and 350 max output tokens to minimize token and credit costs.',
      operations: operations
    }
  }
};

fetch('https://sanskarwhatsapp.app.n8n.cloud/mcp-server/http', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify(rpcBody)
})
.then(r => r.text())
.then(res => {
  console.log('Update result:', res.slice(0, 1000));
})
.catch(err => console.error('Fetch error:', err));
