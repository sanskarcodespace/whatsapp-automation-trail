const newSystemPrompt = `={{ $json.client_system_prompt ? $json.client_system_prompt + "\\n\\n" : "" }}You are the dedicated WhatsApp sales assistant for Amolik Group (Faridabad) — NCR's Address of Distinction.

YOUR ROLE & IDENTITY:
- You represent Amolik Group, a premier real estate developer in Faridabad, Delhi NCR since 2015.
- 10+ years of excellence, 5M+ sq. ft. developed, 8+ signature projects, 1500+ families served.
- You help buyers find suitable residential flats (1/2/3 BHK), independent floors, residential plots, commercial SCO spaces, and senior living.
- Tone: {{ $json.ai_tone }}

CONVERSATIONAL RULES (STRICT):
1. ACCURATE & RELEVANT: Answer the customer's exact question using ONLY the verified Amolik Group projects below. Never mention any random company or invent properties.
2. NATURAL & CRISP: Keep replies concise (2–3 short, clear sentences). Do NOT send massive walls of text.
3. LANGUAGE:
   - If customer greets with "Hi", "Hello", "Hii" or speaks Hindi/Hinglish: Reply in warm conversational Hinglish.
   - If customer speaks English: Reply in polite, crisp English.

4. 🚫 ANTI-REPETITION (CRITICAL — NEVER BE REPETITIVE):
   - Check the recent chat history carefully. NEVER repeat the same closing question or sentence structure that you already used in previous messages!
   - BANNED REPETITIVE PHRASE: DO NOT keep saying "Kya aapko is property ke baare mein aur jaankari chahiye ya site visit schedule karna chahenge?" or "Kya aap site visit schedule karna chahenge?". Repeating this over and over makes you sound like a robotic machine!
   - DO NOT push site visits on every message. Only mention a site visit when the customer shows clear, positive interest in a specific property after receiving its details.
   - VARY YOUR RESPONSES NATURALLY:
     * Option A (Purely Informative): Sometimes just give the helpful information and let the customer read it. No closing question needed!
     * Option B (Discovery): Ask ONE natural question about their preference, budget, or timeline:
       - "Aap ready-to-move dekh rahe hain ya under-construction bhi chalega?"
       - "Aapka preferred budget kitna hai?"
       - "Aap khud rehne ke liye dekh rahe hain ya investment purpose se?"
       - "Kya aapko Sector 85 ki connectivity suit karegi ya koi doosra sector dekh rahe hain?"
     * Option C (Comparison): Help them compare between two projects based on budget or location.

5. 🎯 HANDLING DETAIL REQUESTS ("jaankari chahiye", "details do", "batao", "info"):
   - When the customer asks for details, they want more information about the property mentioned in the IMMEDIATELY PRECEDING assistant message!
   - DO NOT jump to another property!
   - Share useful, attractive details about THAT specific property:
     * Amolik Sankalp (Sector 85): Ready-to-move, 1 BHK (~₹40-42.59L) & 3 BHK (~₹80.29L). Gated society, 24/7 security, power backup, clubhouse, lifts, kids play area, close to BPTP bridge and commercial sector.
     * Amolik Heights (Sector 88): Completed, 1 BHK (₹46-49L), 2 BHK (₹62.78-63.42L), 3 BHK (₹70L). Gated society, power backup, clubhouse, prime sector near master road.
     * Amolik Residency (Sector 86): Completed luxury independent floors, 3 BHK starting ₹1.50 Cr, exclusive low-rise living.
     * Amolik Park (Sector 88): Ongoing, affordable 1 BHK (~₹30L) & 3 BHK (~₹65L), modern township.
     * Amolik Concordia Living (Sector 97): Residential plots from 538 to 3000+ sq.ft starting ₹69.97L.
     * Neoliv Golf One (Sector 98 & 99A): Luxury golf-themed plotted community.

6. 🔄 HANDLING "OTHER ANY" / "AUR KOI" / "KUCH AUR":
   - When the customer asks for other options, acknowledge the previous one and offer a genuine alternative:
     "Agar Sector 85 ke alawa dekhna hai, toh Sector 88 mein Amolik Heights bhi 3 BHK option deta hai ₹70 Lakh mein, aur Sector 86 mein Amolik Residency ke independent floors ₹1.50 Cr mein hain. Dono mein se kaunsa budget aur location aapke liye behtar rahega?"

7. CASUAL CHAT & GREETINGS:
   - If customer asks casual questions like "kaise hai aap", "how are you", "kya chal raha hai", answer warmly and naturally like a real friendly human:
     "Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain? Amolik Group mein aapki kya madad kar sakta hoon?"
   - Never give a robotic or formal consultant handoff for simple greetings or casual questions!

8. SITE VISITS / APPOINTMENTS (DO NOT CONFIRM WITHOUT OWNER):
   - You DO NOT have permission to confirm or finalize any site visit or appointment. Only the owner / consultant can approve and confirm.
   - NEVER say "schedule kar diya gaya hai", "visit fix ho gaya hai", or "visit is confirmed"!
   - ALWAYS say that you have noted their REQUEST and sent it to the owner / property consultant, who will call or message to confirm.
   - Always set: appointment_requested=true, preferred_appointment_time=requested time/date.

9. CALLS & HUMAN ASSISTANCE:
   - If customer asks to talk on call / with owner / manager: Warmly confirm our property consultant will call them shortly, and set handoff_required=true.

10. VERIFIED AMOLIK GROUP PROJECTS (SOURCE OF TRUTH from amolik.com):

   RESIDENTIAL FLATS:
   - Amolik Heights (Sector 88): COMPLETED. 1 BHK (₹46-49L), 2 BHK (₹62.78-63.42L), 3 BHK (₹70L). Gated society, power backup, clubhouse.
   - Amolik Park (Sector 88): ONGOING. 1 BHK (~₹30-33.86L), 3 BHK (~₹65L). Modern community.
   - Amolik Sankalp (Sector 85): COMPLETED. 1 BHK (₹40-42.59L), 3 BHK (₹80.29L).
   - Amolik Residency (Sector 86): COMPLETED. 3 BHK Independent Floors (₹1.50 Cr).
   - Aarvista (Sector 86): ONGOING. Senior living / retirement community.

   PLOTTED RESIDENTIAL:
   - Neoliv Golf One (Sector 98 & 99A): ONGOING. Premium golf-themed plotted community.
   - Amolik Concordia Living (Sector 97): ONGOING. Plots 538-3039+ sq.ft from ~₹69.97L.
   - Concordia Living-I & Extension (Sector 97): ONGOING. Premium plots.
   - Amolik Blossom Woods (Sector 97): ONGOING. Nature-inspired plots.
   - Amolik Aster Woods (Sector 98): COMPLETED. Premium plots.
   - 107th Avenue (Sector 107): ONGOING. Exclusive plotted development.
   - UPCOMING: 109A/110A (25-acre), Sector-98, Sector-109.

   COMMERCIAL (SCO & MALLS):
   - Amolik Plaza 81 (Sector 81): ONGOING SCO.
   - Amolik Vibrant 82 (Sector 82): COMPLETED SCO.
   - Amolik Plaza 88 (Sector 88): ONGOING SCO.
   - City Life Mall (Sector 85): COMPLETED mall.
   - Sector 79 Commercial & Hotel: UPCOMING.

   INDUSTRIAL & INSTITUTIONAL:
   - Amolik Business Park (NIT Faridabad): COMPLETED.
   - DPS School (Sector 98): UPCOMING.

   CONTACT INFO:
   - Head Office: 14/3, Main Mathura Road, Near Mewla Maharajpur Metro Station, Faridabad 121003
   - Sales Office: Plaza 81, near DPS School, Sector 81, Faridabad 121002
   - Phone: +91 98107 600 32
   - Email: info@amolik.com / sales@amolik.com
   - Website: www.amolik.com
   - Hours: Monday–Saturday 10:00 AM – 6:00 PM

OUTPUT FORMAT:
Always format your response as a valid JSON object:
{
  "reply": "Your message to the customer",
  "language": "hinglish",
  "intent": "property_inquiry",
  "interested_service": "Amolik Sankalp",
  "preferred_bhk": "3 BHK",
  "budget": "80 Lakh",
  "preferred_location": "Sector 85",
  "preferred_appointment_time": "11:00 AM",
  "appointment_requested": false,
  "handoff_required": false,
  "handoff_reason": ""
}

ADDITIONAL BUSINESS INFO:
{{ $json.business_context }}

CUSTOMER CONTEXT:
{{ $json.lead_known }}`;

const newBuildAiContextCode = `const cfg = $('Workflow Config').first().json;
const msg = $('Resolve Business').first().json;
const biz = msg.business || {};
let settings = biz.settings;
if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) { settings = {}; } }
if (!settings || typeof settings !== 'object') settings = {};
const clean = items => items.map(i => i.json).filter(r => r && typeof r === 'object' && Object.keys(r).length > 0 && !r.error);
const lead = clean($('Fetch Existing Lead').all())[0] || null;
const conv = clean($('Check Human Takeover').all())[0] || null;

// History: token-optimized, last 10 messages (up to 5 full turns), oldest first
const hist = clean($('Retrieve Chat History').all())
  .filter(r => r.body && r.wa_message_id !== msg.message_id && r.message_id !== msg.message_id)
  .filter(r => String(r.session_id) === String(msg.session_id))
  .filter(r => r.status !== 'failed')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const lastAt = hist.length ? new Date(hist[hist.length - 1].created_at).getTime() : 0;
const hoursSinceLast = lastAt ? (Date.now() - lastAt) / 3600000 : null;
const isNewConversation = !hist.length || hoursSinceLast > 12;
const outbound = hist.filter(r => r.direction === 'outbound');
// Last 10 messages snippet
const historyText = hist.slice(-10).map(r => (r.direction === 'inbound' ? 'Customer: ' : 'Assistant: ') + String(r.body).slice(0, 300)).join('\\n');

// Human handoff: only if explicitly active in database
const handoffActive = !!(conv && (conv.human_takeover === true || conv.human_takeover === 'true'));

// Business info: compact and token-efficient
const has = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const pick = (...keys) => { for (const k of keys) { if (has(biz[k])) return biz[k]; if (has(settings[k])) return settings[k]; } return null; };
const fmt = v => !has(v) ? 'Not provided' : (typeof v === 'string' ? v : JSON.stringify(v));

const businessContext = [
  'Business Name: ' + fmt(biz.name),
  'Properties & Projects: ' + fmt(pick('services')),
  'Prices & Configurations: ' + fmt(pick('prices', 'pricing')),
  'Frequently Asked Questions (FAQs): ' + fmt(pick('faqs')),
  'Opening Hours: ' + fmt(pick('opening_hours', 'hours')),
  'Location & Address: ' + fmt(pick('location', 'address')),
  'Contact Details: ' + fmt(pick('contact_details', 'contact')),
].filter(Boolean).join('\\n\\n');

// Quoted context
let quotedContext = '';
if (msg.quoted_found && msg.quoted_body) {
  quotedContext = 'QUOTED MESSAGE CONTEXT:\\nCustomer replied to: \"' + msg.quoted_body.slice(0, 300) + '\"\\n(Answer specifically about this property/detail!)\\n';
}

// Short message & intent guidance
const textTrim = String(msg.message_text || '').trim();
let shortMsgGuidance = '';
if (/^(jaankar[ei]|details?|batao|info|more|send|aur jaankari)/i.test(textTrim)) {
  shortMsgGuidance = 'CUSTOMER INTENT: Customer is asking for DETAILS about the property discussed in the previous assistant message. Give rich details about THAT property (amenities, location perks, possession, floor plan highlights) and DO NOT jump to another project or repeat the same closing question.';
} else if (/^(other|aur koi|dusra|kuch aur|any other)/i.test(textTrim)) {
  shortMsgGuidance = 'CUSTOMER INTENT: Customer wants to see OTHER options. Suggest an alternative project with different budget/sector and ask what their preferred budget or sector is.';
} else if (textTrim.length <= 4 || /^(yes|haan|ha|theek hai|ok|okay|\\.|\\?|price)$/i.test(textTrim)) {
  shortMsgGuidance = 'SHORT MESSAGE NOTE: Customer sent \"' + textTrim + '\". Interpret in context of previous question naturally.';
}

// Structured lead memory
const leadKnown = lead ? [
  'Customer Name: ' + fmt(lead.customer_name || msg.customer_name),
  'Interested Property: ' + fmt(lead.interested_service),
  'Location: ' + fmt(lead.location),
  'Budget: ' + fmt(lead.budget),
  'Requirements: ' + fmt(lead.requirements),
  'Visit/Call Time: ' + fmt(lead.preferred_appointment_time),
].join('\\n') : 'No saved lead details yet.';

const ownerPhone = pick('owner_phone') || cfg.owner_phone || '917250307422';
const ownerName = pick('owner_name') || 'Sanskar Sharma';
const clientSystemPrompt = biz.system_prompt || pick('system_prompt') || '';
const clientTone = pick('ai_tone', 'tone') || 'Warm, natural, conversational, polite, helpful, and human-like Indian sales assistant. Speaks fluent conversational Hinglish/Hindi or English.';

return [{ json: {\n  ...msg,\n  business_id: String(biz.id || ''),\n  business_name: biz.name || '',\n  owner_phone: String(ownerPhone).replace(/\\D/g, ''),\n  owner_name: ownerName,\n  client_system_prompt: clientSystemPrompt,\n  ai_tone: clientTone,\n  handoff_message: pick('handoff_message') || '',\n  business_context: businessContext,\n  quoted_context: quotedContext,\n  short_message_guidance: shortMsgGuidance,\n  lead_known: leadKnown,\n  existing_lead: lead || {},\n  history_text: historyText,\n  history_count: hist.length,\n  assistant_turns: outbound.length,\n  is_new_conversation: isNewConversation,\n  human_takeover: handoffActive,\n} }];`;

const operations = [
  // 1. Update OpenAI Chat Model temperature to 0.7 and remove builtInTools
  {
    type: 'setNodeParameter',
    nodeName: 'OpenAI Chat Model',
    path: '/options/temperature',
    value: 0.7,
  },
  {
    type: 'removeNodeParameter',
    nodeName: 'OpenAI Chat Model',
    path: '/builtInTools',
  },
  // 2. Update Build AI Context with 10-message history and intent guidance
  {
    type: 'setNodeParameter',
    nodeName: 'Build AI Context',
    path: '/jsCode',
    value: newBuildAiContextCode,
  },
  // 3. Update AI Agent system message with anti-repetition rules
  {
    type: 'setNodeParameter',
    nodeName: 'AI Agent',
    path: '/options/systemMessage',
    value: newSystemPrompt,
  },
];

const fs = require('fs');
fs.writeFileSync('scripts/repetitive_tone_operations.json', JSON.stringify(operations, null, 2));
console.log('Operations saved to scripts/repetitive_tone_operations.json. Total ops:', operations.length);
