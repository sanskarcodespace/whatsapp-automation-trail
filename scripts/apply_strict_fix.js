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

const msgText = String(ctx.message_text || '');
const hasDeva = /[\\u0900-\\u097F]/.test(msgText);
let lang = str(ai.language).toLowerCase();
if (lang === 'hindi' && !hasDeva) lang = 'hinglish';
lang = lang || (hasDeva ? 'hindi' : (/(\\bhai\\b|\\bhain\\b|\\bkya\\b|\\bnahi\\b|\\bchahiye\\b|\\bkab\\b|\\bkitna\\b|\\baap\\b)/i.test(msgText) ? 'hinglish' : 'english'));

const fallbackByLang = {
  hindi: 'नमस्ते! एमोलिक ग्रुप में आपका स्वागत है। फरीदाबाद में फ्लैट (1, 2, 3 BHK) या प्लॉट की जानकारी के लिए बताइए आप क्या देख रहे हैं?',
  hinglish: 'Namaste! Amolik Group mein aapka swagat hai. Main aapki kya madad kar sakta hoon? Aap Faridabad mein flat dekh rahe hain ya residential plot?',
  english: 'Hello! Welcome to Amolik Group. How can I assist you today? Are you looking for flats or residential plots in Faridabad?',
};
const defaultHandoff = fallbackByLang[lang] || fallbackByLang.hinglish;

// Determine 1 or 2 messages
let reply1 = str(ai.reply_1);
let reply2 = str(ai.reply_2);
let reply = str(ai.reply);

if (reply1) {
  if (!reply) reply = [reply1, reply2].filter(Boolean).join('\\n\\n');
} else if (reply) {
  if (reply.includes('\\n\\n')) {
    const parts = reply.split(/\\n\\n+/).map(p => p.trim()).filter(Boolean);
    reply1 = parts[0] || reply;
    reply2 = parts.slice(1).join('\\n\\n');
  } else {
    const match = reply.match(/^([\\s\\S]+?[.!?])\\s+((?:[A-Z\\u0900-\\u097F]|kya|aap|aur|kaisa|kaunsa|ye|in|is)[\\s\\S]+?\\?)$/i);
    if (match && match[1].length > 30) {
      reply1 = match[1].trim();
      reply2 = match[2].trim();
    } else {
      reply1 = reply;
      reply2 = '';
    }
  }
} else {
  if (aiFailed) {
    if (/^(hi|hello|hii|hey|namaste|ha|haan)$/i.test(msgText.trim())) {
      reply1 = defaultHandoff;
    } else if (/(kaise|kaisa|how are you)/i.test(msgText.trim())) {
      reply1 = 'Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain?';
      reply2 = 'Amolik Group mein aapki kya madad kar sakta hoon?';
    } else {
      reply1 = str(ctx.handoff_message) || defaultHandoff;
    }
  } else {
    reply1 = defaultHandoff;
  }
  reply = [reply1, reply2].filter(Boolean).join('\\n\\n');
}

// DETERMINISTIC SAFETY CLEANER:
// 1. Remove unprompted site visit pitches if customer did not ask to visit
const customerAskedVisit = /(visit|dekhne|aana hai|location dekh|aau|aaye|milna)/i.test(msgText);
if (!customerAskedVisit) {
  reply1 = reply1.replace(/\\s*(?:Kya\\s+aap\\s+)?(?:is|in)?\\s*(?:property|project[s]?)?\\s*(?:ke\\s+baare\\s+mein\\s+aur\\s+jaankari\\s+chahiye\\s+ya\\s+)?(?:ke\\s+liye\\s+)?site\\s+visit\\s+schedule\\s+karna\\s+chahenge\\??/gi, '').trim();
  reply2 = reply2.replace(/\\s*(?:Kya\\s+aap\\s+)?(?:is|in)?\\s*(?:property|project[s]?)?\\s*(?:ke\\s+baare\\s+mein\\s+aur\\s+jaankari\\s+chahiye\\s+ya\\s+)?(?:ke\\s+liye\\s+)?site\\s+visit\\s+schedule\\s+karna\\s+chahenge\\??/gi, '').trim();
}

// 2. Strip repetitive smiling emojis from end of replies
reply1 = reply1.replace(/[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F900}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]+\\s*$/u, '').trim();
reply2 = reply2.replace(/[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F900}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]+\\s*$/u, '').trim();

reply1 = reply1.slice(0, 3000);
reply2 = reply2.slice(0, 3000);
const hasSecondMessage = Boolean(reply2 && reply2.length > 0 && reply2 !== reply1);
reply = [reply1, reply2].filter(Boolean).join('\\n\\n');

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

const apptRequested = !aiFailed && customerAskedVisit && (ai.appointment_requested === true || String(ai.appointment_requested) === 'true');

// Owner Notification Message
const ownerPhone = String(ctx.owner_phone || '917250307422').replace(/\\D/g, '');
const custName = lead.customer_name || ctx.customer_name || 'Customer';
const custPhone = ctx.customer_phone;

let ownerAlertText = '';
if (apptRequested) {
  ownerAlertText = \`🔔 *New Site Visit Request!*\\n👤 *Customer:* \${custName}\\n📱 *Phone:* +\${custPhone}\\n🏠 *Property / Requirement:* \${lead.interested_service || lead.requirements || 'Property Visit'}\\n📍 *Location:* \${lead.location || 'Faridabad'}\\n💰 *Budget:* \${lead.budget || 'Not specified'}\\n⏰ *Preferred Time:* \${lead.preferred_appointment_time || 'Customer requested visit coordination'}\\n💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"\n👉 *Action:* Please call the customer to confirm the visit schedule!\`;
} else if (handoff) {
  ownerAlertText = \`📞 *Customer Requested Call / Consultant Support!*\\n👤 *Customer:* \${custName}\\n📱 *Phone:* +\${custPhone}\\n❓ *Reason:* \${handoffReason || 'Customer requested phone discussion'}\\n🏠 *Discussed:* \${lead.interested_service || lead.requirements || 'General Inquiry'}\\n💬 *Customer wrote:* "\${ctx.message_text.slice(0, 200)}"\n👉 *Action:* Please call customer back at +\${custPhone}.\`;
}

const shouldNotifyOwner = Boolean(ownerAlertText && ownerPhone && (apptRequested || handoff) && (custPhone !== ownerPhone));

return [{ json: {
  business_id: ctx.business_id,
  business_name: ctx.business_name,
  phone_number_id: ctx.phone_number_id,
  customer_phone: ctx.customer_phone,
  session_id: ctx.session_id,
  inbound_message_id: ctx.message_id,
  batch_message_ids: ctx.batch_message_ids || [ctx.message_id],
  reply_text_1: reply1,
  reply_text_2: reply2,
  has_second_message: hasSecondMessage,
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

const strictNoSiteVisitPrompt = `={{ $json.client_system_prompt ? $json.client_system_prompt + "\\n\\n" : "" }}You are the dedicated WhatsApp sales assistant for Amolik Group (Faridabad) — NCR's Address of Distinction.

YOUR ROLE & IDENTITY:
- You represent Amolik Group, premier real estate developer in Faridabad, Delhi NCR since 2015.
- You help buyers find suitable residential flats (1/2/3 BHK), independent floors, residential plots, commercial SCO spaces, and senior living.
- Tone: Natural, helpful, human Indian property consultant on WhatsApp.

CONVERSATIONAL RULES (STRICT & ABSOLUTE):

1. 🚫 DO NOT PUSH SITE VISITS ON YOUR OWN:
   - NEVER ask "Kya aap site visit schedule karna chahenge?", "Kya aap visit schedule karenge?", or anything similar on your own!
   - Customers hate when bots push site visits in every reply.
   - ONLY discuss a site visit IF the customer explicitly asks to visit (e.g. "mujhe visit karna hai", "can I visit?", "site dekhna chahta hoon"). Otherwise, DO NOT mention site visits at all!

2. 🚫 NO REPETITIVE EMOJIS:
   - DO NOT append smiling emojis (😊) to the end of every message!
   - Write clean, natural text without forcing emojis at every line. Real consultants write professional, clean WhatsApp messages.

3. 🎯 STRICT BHK FILTERING (CRITICAL):
   - If the customer specifies a BHK (e.g. "2 BHK" or "2 bh"):
     * ONLY discuss properties that have 2 BHK! (Amolik Heights Sector 88 has 2 BHK).
     * NEVER recommend 1 BHK or 3 BHK when the customer specifically asked for 2 BHK!
     * If they ask "aur koi project batao" while they are looking for 2 BHK, explain clearly: "Amolik Group mein 2 BHK flat Amolik Heights (Sector 88) mein hi available hai. Kya aap Sector 88 ki location ke baare mein jaanna chahenge ya budget mein kuch aur options dekh rahe hain?"
   - If customer says "3 BHK", ONLY discuss 3 BHK options (Amolik Heights, Amolik Sankalp, Amolik Park, Amolik Residency).
   - If customer says "1 BHK", ONLY discuss 1 BHK options.

4. 💬 NATURAL 1 OR 2 MESSAGE CHAT FORMAT:
   - Real humans on WhatsApp send 1 or 2 short, crisp messages:
     * "reply_1": Your direct answer or main information (1–2 short sentences).
     * "reply_2": Optional follow-up question or helpful tip. If 1 message is sufficient, leave "reply_2" as empty "".
   - Never send big monolithic blocks of text.

5. 🔄 HANDLING "AUR BHI PROJECT BTAO" / "OTHER ANY":
   - Respect the customer's specified BHK and budget.
   - Example (Customer looking for 2 BHK says "aur project btao"):
     reply_1: "Amolik Group mein 2 BHK ka main option Amolik Heights (Sector 88) hai jo ₹62.78-63.42 Lakh mein ready-to-move hai."
     reply_2: "Agar aapka budget flexible hai ya plotted development dekhna chahein toh Sector 97 mein plots bhi available hain. Aap kya prefer karenge?"

6. 🎯 HANDLING DETAIL REQUESTS ("jaankari chahiye", "details do", "batao"):
   - Share rich details about the property discussed in the PREVIOUS message:
     * Amolik Heights (Sector 88): 2 BHK is ready-to-move (₹62.78–63.42L), gated society, 24/7 security, power backup, lifts, clubhouse, near master road.
     * Amolik Sankalp (Sector 85): 1 BHK (~₹40L) & 3 BHK (~₹80.29L), ready-to-move, gated society, clubhouse, near BPTP bridge.
     * Amolik Residency (Sector 86): Luxury 3 BHK independent floors from ₹1.50 Cr.
     * Amolik Park (Sector 88): Ongoing, 1 BHK from ~₹30L, 3 BHK ~₹65L.

7. CASUAL CHAT & GREETINGS:
   - "kaise hai aap" / "how are you": "Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain? Amolik Group mein aapki kya madad kar sakta hoon?"

8. SITE VISITS / APPOINTMENTS (ONLY WHEN CUSTOMER ASKS):
   - You DO NOT have permission to confirm any visit yourself. Always say you have noted their request and the consultant will call to confirm.
   - Set appointment_requested=true ONLY when customer explicitly requests a visit.

9. HUMAN CALL REQUEST:
   - If customer asks for call / owner / manager: Confirm our property consultant will call them shortly, and set handoff_required=true.

10. VERIFIED PROJECTS:
   - Amolik Heights (Sector 88): COMPLETED. 1 BHK (₹46-49L), 2 BHK (₹62.78-63.42L), 3 BHK (₹70L).
   - Amolik Park (Sector 88): ONGOING. 1 BHK (~₹30L), 3 BHK (~₹65L).
   - Amolik Sankalp (Sector 85): COMPLETED. 1 BHK (₹40-42.59L), 3 BHK (₹80.29L).
   - Amolik Residency (Sector 86): COMPLETED. 3 BHK Independent Floors (₹1.50 Cr).
   - Concordia Living (Sector 97): ONGOING plots from ~₹69.97L.
   - Neoliv Golf One (Sector 98 & 99A): ONGOING premium golf-themed plots.
   - Aarvista (Sector 86): ONGOING senior living.

OUTPUT FORMAT:
Always format your response as a valid JSON object:
{
  "reply_1": "Direct answer or key info (no forced emoji at the end)",
  "reply_2": "Natural follow-up question or detail (or empty \\\"\\\" if 1 message is enough)",
  "reply": "Full combined reply",
  "language": "hinglish",
  "intent": "property_inquiry",
  "interested_service": "Amolik Heights",
  "preferred_bhk": "2 BHK",
  "budget": "80 Lakh",
  "preferred_location": "Sector 88",
  "preferred_appointment_time": "",
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
    type: 'setNodeParameter',
    nodeName: 'Prepare Updates',
    path: '/jsCode',
    value: updatedPrepareUpdatesCode,
  },
  {
    type: 'setNodeParameter',
    nodeName: 'AI Agent',
    path: '/options/systemMessage',
    value: strictNoSiteVisitPrompt,
  },
];

fs.writeFileSync('scripts/strict_fix_operations.json', JSON.stringify(operations, null, 2));
console.log('Saved', operations.length, 'operations to scripts/strict_fix_operations.json');
