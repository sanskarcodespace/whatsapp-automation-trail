const fs = require('fs');

const updatedPrepareUpdatesCode = `const ctx = $('Build AI Context').first().json;
const raw = $input.first().json || {};
const aiFailed = raw.ai_failed === true;

// Extract raw text from the AI Agent node output
let outputText = '';
if (typeof raw === 'string') {
  outputText = raw;
} else if (raw.output !== undefined) {
  outputText = typeof raw.output === 'string' ? raw.output : JSON.stringify(raw.output);
} else if (raw.text !== undefined) {
  outputText = typeof raw.text === 'string' ? raw.text : JSON.stringify(raw.text);
} else if (raw.message !== undefined) {
  outputText = typeof raw.message === 'string' ? raw.message : JSON.stringify(raw.message);
} else {
  outputText = JSON.stringify(raw);
}

// Extract JSON if present in outputText
let ai = {};
try {
  const jsonMatch = outputText.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    ai = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  ai = {};
}
if (!ai || typeof ai !== 'object') ai = {};

const str = v => (v === null || v === undefined) ? '' : String(v).trim();
const now = new Date().toISOString();

// Determine reply text
let reply = str(ai.reply);
if (!reply && !aiFailed) {
  let cleaned = outputText.replace(/^\\s*\`\`\`(json)?/i, '').replace(/\`\`\`\\s*$/i, '').trim();
  if (cleaned && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    reply = cleaned;
  }
}

const msgText = String(ctx.message_text || '');
const hasDeva = /[\\u0900-\\u097F]/.test(msgText);
let lang = str(ai.language).toLowerCase();
if (lang === 'hindi' && !hasDeva) lang = 'hinglish';
lang = lang || (hasDeva ? 'hindi' : (/(\\bhai\\b|\\bhain\\b|\\bkya\\b|\\bnahi\\b|\\bchahiye\\b|\\bkab\\b|\\bkitna\\b|\\baap\\b)/i.test(msgText) ? 'hinglish' : 'english'));

const fallbackByLang = {
  hindi: 'नमस्ते! एमोलिक हाउसिंग में आपका स्वागत है। फरीदाबाद में 1, 2, या 3 BHK फ्लैट या प्लॉट की जानकारी के लिए बताइए आप क्या देख रहे हैं?',
  hinglish: 'Namaste! Amolik Housing mein aapka swagat hai. Main aapki kya madad kar sakta hoon? Aap Faridabad mein flat (1, 2, ya 3 BHK) dekh rahe hain ya residential plot?',
  english: 'Hello! Welcome to Amolik Housing. How can I assist you today? Are you looking for flats (1, 2, or 3 BHK) or plots in Faridabad?',
};
const defaultHandoff = fallbackByLang[lang] || fallbackByLang.hinglish;

if (!reply) {
  if (aiFailed) {
    if (/^(hi|hello|hii|hey|namaste|ha|haan)$/i.test(msgText.trim())) {
      reply = defaultHandoff;
    } else if (/(kaise|kaisa|how are you)/i.test(msgText.trim())) {
      reply = 'Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain? Amolik Housing mein aapki kya madad kar sakta hoon?';
    } else {
      reply = str(ctx.handoff_message) || defaultHandoff;
    }
  } else {
    reply = defaultHandoff;
  }
}
reply = reply.slice(0, 4000);

// Human handoff detection
const humanRegex = /(\\bhuman\\b|\\bagent\\b|representative|real person|\\bmanager\\b|\\bowner\\b|\\binsaan\\b|\\binsan\\b|staff se baat|kisi se baat|call me|call karo|phone karo|baat karni hai|इंसान|मैनेजर)/i;
const customerAskedHuman = humanRegex.test(msgText);
const handoff = ai.handoff_required === true || customerAskedHuman;
const handoffReason = customerAskedHuman && !ai.handoff_required 
  ? 'Customer requested a call / human representative' 
  : str(ai.handoff_reason) || (handoff ? 'Customer requested human assistance' : '');

const keepHumanTakeover = ctx.human_takeover === true;

// Lead updates
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

const apptRequested = !aiFailed && (ai.appointment_requested === true || String(ai.appointment_requested) === 'true');

// Owner Notification Message
const ownerPhone = String(ctx.owner_phone || '917250307422').replace(/\\D/g, '');
const custName = lead.customer_name || ctx.customer_name || 'Customer';
const custPhone = ctx.customer_phone;

let ownerAlertText = '';
if (apptRequested) {
  ownerAlertText = \`🔔 *New Site Visit Request!*\\n👤 *Customer:* \${custName}\\n📱 *Phone:* +\${custPhone}\\n🏠 *Property / Requirement:* \${lead.interested_service || lead.requirements || 'Property Visit'}\\n📍 *Location:* \${lead.location || 'Faridabad'}\\n💰 *Budget:* \${lead.budget || 'Not specified'}\\n⏰ *Preferred Time:* \${lead.preferred_appointment_time || 'Customer requested visit coordination'}\\n💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"\\n👉 *Action:* Please call the customer to confirm the visit schedule!\`;
} else if (handoff) {
  ownerAlertText = \`📞 *Customer Requested Call / Consultant Support!*\\n👤 *Customer:* \${custName}\\n📱 *Phone:* +\${custPhone}\\n❓ *Reason:* \${handoffReason || 'Customer requested phone discussion'}\\n🏠 *Discussed:* \${lead.interested_service || lead.requirements || 'General Inquiry'}\\n💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"\\n👉 *Action:* Please call customer back at +\${custPhone}.\`;
}

// Only notify owner if there is a real handoff/appointment and customer is not the owner during testing
const shouldNotifyOwner = !!(ownerAlertText && ownerPhone && (apptRequested || handoff) && (custPhone !== ownerPhone));

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
    human_takeover: keepHumanTakeover,
    status: 'open',
    last_message: reply.slice(0, 500),
    last_inbound_at: ctx.message_timestamp,
    last_message_at: now,
    updated_at: now,
  },
} }];`;

const updatedSystemMessage = `={{ $json.client_system_prompt ? $json.client_system_prompt + "\\n\\n" : "" }}You are the dedicated WhatsApp sales assistant for Amolik Housing (Faridabad).

YOUR ROLE & IDENTITY:
- You represent Amolik Housing, a premier developer in Faridabad, Haryana.
- You help buyers find suitable residential flats (1 BHK, 2 BHK, 3 BHK) and plots.
- Tone: {{ $json.ai_tone }}

CONVERSATIONAL RULES (STRICT):
1. ACCURATE & RELEVANT: Answer the customer's exact question using ONLY the verified Amolik Housing properties below. Never mention any random company or invent properties.
2. NATURAL & FAST: Keep replies concise (2–3 short, clear sentences). Do NOT send massive walls of text.
3. LANGUAGE:
   - If customer greets with "Hi", "Hello", "Hii" or speaks Hindi/Hinglish: Reply in warm conversational Hinglish:
     "Namaste! Amolik Housing mein aapka swagat hai. Main aapki kya madad kar sakta hoon? Aap Faridabad mein flat (1, 2, ya 3 BHK) dekh rahe hain ya residential plot?"
   - If customer speaks English: Reply in polite, crisp English.
4. AT MOST ONE QUESTION: Ask at most ONE relevant question per reply (e.g. asking their BHK preference, budget, or preferred sector).

5. CASUAL CHAT & GREETINGS:
   - If customer asks casual questions like "kaise hai aap", "how are you", "kya chal raha hai", answer warmly and naturally like a real friendly human:
     "Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain? Amolik Housing mein aapki kya madad kar sakta hoon?"
   - Never give a robotic or formal consultant handoff for simple greetings or casual questions!

6. CRITICAL: SITE VISITS / APPOINTMENTS (DO NOT CONFIRM WITHOUT OWNER):
   - You DO NOT have permission to confirm or finalize any site visit or appointment. Only the owner / consultant can approve and confirm.
   - NEVER say "schedule kar diya gaya hai", "visit fix ho gaya hai", or "visit is confirmed"!
   - ALWAYS say that you have noted their REQUEST and sent it to the owner / property consultant, who will call or message to confirm the availability/timing.
   - Example reply in Hinglish:
     "Maine 11:00 AM ke site visit ki request note kar li hai aur hamare property consultant / owner ko forward kar di hai. Hamari team jald hi aapse call par connect karke slot confirm karegi! 😊"
   - Example reply in English:
     "I have noted your site visit request for 11:00 AM and forwarded it to our property consultant. Our team will contact you shortly to confirm the appointment! 😊"
   - Always set: appointment_requested=true, preferred_appointment_time=requested time/date.

7. CALLS & HUMAN ASSISTANCE:
   - If customer asks to talk on call / with owner / manager: Warmly confirm our property consultant will call them shortly, and set handoff_required=true.

8. VERIFIED AMOLIK HOUSING PROPERTIES (SOURCE OF TRUTH):
   - Amolik Heights (Sector 88): Ready to move. 1 BHK (₹46-49L), 2 BHK (₹62.78-63.42L), 3 BHK (₹70L). Gated society, power backup, clubhouse.
   - Amolik Park View (Sector 84): Under construction (Possession Aug 2027). 1 BHK (₹30-33.86L), 3 BHK (₹65L).
   - Amolik Sankalp (Sector 85): Ready to move. 1 BHK (₹40-42.59L), 3 BHK (₹80.29L).
   - Amolik Residency (Sector 86): Ready to move independent floors. 3 BHK (₹1.50 Cr).
   - Amolik Concordia Living & Living I (Tajupur): Residential Plots from ₹69.97L (538 to 3000+ sq.ft).

OUTPUT FORMAT:
Always format your response as a valid JSON object:
{
  "reply": "Your message to the customer",
  "language": "hinglish",
  "intent": "property_inquiry",
  "interested_service": "Amolik Heights",
  "preferred_bhk": "2 BHK",
  "budget": "60 Lakh",
  "preferred_location": "Sector 88",
  "preferred_appointment_time": "11:00 AM",
  "appointment_requested": false,
  "handoff_required": false,
  "handoff_reason": ""
}

ADDITIONAL BUSINESS INFO:
{{ $json.business_context }}

CUSTOMER CONTEXT:
{{ $json.lead_known }}`;

const operations = [
  {
    type: 'removeConnection',
    source: 'Structured Reply Parser',
    target: 'AI Agent',
    connectionType: 'ai_outputParser'
  },
  {
    type: 'removeNode',
    nodeName: 'Structured Reply Parser'
  },
  {
    type: 'setNodeParameter',
    nodeName: 'AI Agent',
    path: '/hasOutputParser',
    value: false
  },
  {
    type: 'setNodeParameter',
    nodeName: 'AI Agent',
    path: '/options/systemMessage',
    value: updatedSystemMessage
  },
  {
    type: 'setNodeParameter',
    nodeName: 'Prepare Updates',
    path: '/jsCode',
    value: updatedPrepareUpdatesCode
  }
];

fs.writeFileSync('scripts/output_fix_operations.json', JSON.stringify(operations, null, 2));
console.log('Operations saved to scripts/output_fix_operations.json');
