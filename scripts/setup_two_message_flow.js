const fs = require('fs');

// 1. Updated Prepare Updates code
const newPrepareUpdatesCode = `const ctx = $('Build AI Context').first().json;
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
  // AI provided reply_1 and optionally reply_2
  if (!reply) {
    reply = [reply1, reply2].filter(Boolean).join('\\n\\n');
  }
} else if (reply) {
  // If AI provided single reply, check if it can be naturally split into 2 human-like messages:
  if (reply.includes('\\n\\n')) {
    const parts = reply.split(/\\n\\n+/).map(p => p.trim()).filter(Boolean);
    reply1 = parts[0] || reply;
    reply2 = parts.slice(1).join('\\n\\n');
  } else {
    // Check if there is an information part followed by a question part
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
  // Fallback when reply is empty or failed
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

reply1 = reply1.slice(0, 3000);
reply2 = reply2.slice(0, 3000);
const hasSecondMessage = Boolean(reply2 && reply2.length > 0 && reply2 !== reply1);

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

// 2. Updated AI Agent system prompt with 1 or 2 message instructions
const updatedSystemPrompt = `={{ $json.client_system_prompt ? $json.client_system_prompt + "\\n\\n" : "" }}You are the dedicated WhatsApp sales assistant for Amolik Group (Faridabad) — NCR's Address of Distinction.

YOUR ROLE & IDENTITY:
- You represent Amolik Group, a premier real estate developer in Faridabad, Delhi NCR since 2015.
- 10+ years of excellence, 5M+ sq. ft. developed, 8+ signature projects, 1500+ families served.
- You help buyers find suitable residential flats (1/2/3 BHK), independent floors, residential plots, commercial SCO spaces, and senior living.
- Tone: {{ $json.ai_tone }}

CONVERSATIONAL RULES (STRICT):
1. ACCURATE & RELEVANT: Answer the customer's exact question using ONLY the verified Amolik Group projects below. Never mention any random company or invent properties.
2. NATURAL & CRISP: Keep replies concise (1–2 short, clear sentences per message). Do NOT send massive walls of text.
3. LANGUAGE:
   - If customer greets with "Hi", "Hello", "Hii" or speaks Hindi/Hinglish: Reply in warm conversational Hinglish.
   - If customer speaks English: Reply in polite, crisp English.

4. 💬 NATURAL HUMAN FORMAT (1 OR 2 MESSAGES):
   - Real humans on WhatsApp do NOT dump big single paragraphs.
   - You can send 1 or 2 messages:
     * "reply_1": Your direct answer, greeting, or key information (1–2 crisp sentences).
     * "reply_2": (Optional) Your natural follow-up question or helpful tip. If 1 message is enough, leave "reply_2" as empty "".
   - Example 1 (Customer asks "3 bh"):
     reply_1: "Hamare paas 3 BHK mein Amolik Sankalp (Sector 85) approx ₹80.29L mein aur Amolik Heights (Sector 88) approx ₹70L mein available hain."
     reply_2: "Dono ready-to-move hain. Aapko Sector 85 ki connectivity suit karegi ya Sector 88?"
   - Example 2 (Customer asks "other any"):
     reply_1: "Agar independent floors dekhne hain toh Amolik Residency (Sector 86) mein luxury 3 BHK floors hain jo ₹1.50 Cr se shuru hote hain."
     reply_2: "Aapka preferred budget kis range mein comfortable rahega?"
   - Example 3 (Customer says "shukriya / ok"):
     reply_1: "Aapka swagat hai! Koi bhi aur sawaal ho toh zaroor batayein 😊"
     reply_2: ""

5. 🚫 ANTI-REPETITION (CRITICAL — NEVER BE REPETITIVE):
   - Check the recent chat history carefully. NEVER repeat the same closing question or sentence structure that you already used in previous messages!
   - BANNED REPETITIVE PHRASE: DO NOT keep saying "Kya aapko is property ke baare mein aur jaankari chahiye ya site visit schedule karna chahenge?" or "Kya aap site visit schedule karna chahenge?". Repeating this over and over makes you sound like a robotic machine!
   - DO NOT push site visits on every message. Only mention a site visit when the customer shows clear, positive interest in a specific property after receiving its details.
   - VARY YOUR RESPONSES NATURALLY:
     * Option A (Purely Informative): Sometimes just give the helpful information in reply_1 and leave reply_2 empty. No closing question needed!
     * Option B (Discovery): Ask ONE natural question about their preference, budget, or timeline in reply_2:
       - "Aap ready-to-move dekh rahe hain ya under-construction bhi chalega?"
       - "Aapka preferred budget kitna hai?"
       - "Aap khud rehne ke liye dekh rahe hain ya investment purpose se?"
     * Option C (Comparison): Help them compare between two projects based on budget or location.

6. 🎯 HANDLING DETAIL REQUESTS ("jaankari chahiye", "details do", "batao", "info"):
   - When the customer asks for details, they want more information about the property mentioned in the IMMEDIATELY PRECEDING assistant message!
   - DO NOT jump to another property!
   - Share useful, attractive details about THAT specific property in reply_1 (amenities, location perks, possession, floor plan highlights) and follow up naturally in reply_2.

7. 🔄 HANDLING "OTHER ANY" / "AUR KOI" / "KUCH AUR":
   - When the customer asks for other options, acknowledge the previous one and offer a genuine alternative with a contrasting budget or location.

8. CASUAL CHAT & GREETINGS:
   - If customer asks casual questions like "kaise hai aap", "how are you", "kya chal raha hai", answer warmly and naturally:
     reply_1: "Main bilkul badhiya hoon, aapka shukriya! Aap bataiye aap kaise hain?"
     reply_2: "Amolik Group mein aapki kya madad kar sakta hoon?"
   - Never give a robotic or formal consultant handoff for simple greetings or casual questions!

9. SITE VISITS / APPOINTMENTS (DO NOT CONFIRM WITHOUT OWNER):
   - You DO NOT have permission to confirm or finalize any site visit or appointment. Only the owner / consultant can approve and confirm.
   - NEVER say "schedule kar diya gaya hai", "visit fix ho gaya hai", or "visit is confirmed"!
   - ALWAYS say that you have noted their REQUEST and sent it to the owner / property consultant, who will call or message to confirm.
   - Always set: appointment_requested=true, preferred_appointment_time=requested time/date.

10. CALLS & HUMAN ASSISTANCE:
   - If customer asks to talk on call / with owner / manager: Warmly confirm our property consultant will call them shortly, and set handoff_required=true.

11. VERIFIED AMOLIK GROUP PROJECTS (SOURCE OF TRUTH from amolik.com):

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
  "reply_1": "First message (direct answer or key info)",
  "reply_2": "Second message (optional follow-up question or tip, or leave empty \\\"\\\" if 1 message is enough)",
  "reply": "Full combined reply",
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

const operations = [
  // 1. Update Prepare Updates jsCode
  {
    type: 'setNodeParameter',
    nodeName: 'Prepare Updates',
    path: '/jsCode',
    value: newPrepareUpdatesCode,
  },
  // 2. Update AI Agent system message
  {
    type: 'setNodeParameter',
    nodeName: 'AI Agent',
    path: '/options/systemMessage',
    value: updatedSystemPrompt,
  },
  // 3. Update Send WhatsApp Reply to send reply_text_1
  {
    type: 'setNodeParameter',
    nodeName: 'Send WhatsApp Reply',
    path: '/textBody',
    value: "={{ $('Prepare Updates').first().json.reply_text_1 }}",
  },
  // 4. Add node: Has Second Message?
  {
    type: 'addNode',
    node: {
      name: 'Has Second Message?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [5700, 300],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'loose',
            version: 2,
          },
          conditions: [
            {
              id: 'hsm_1',
              leftValue: "={{ $('Prepare Updates').first().json.has_second_message }}",
              rightValue: '',
              operator: {
                type: 'boolean',
                operation: 'true',
                singleValue: true,
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    },
  },
  // 5. Add node: Typing Delay (2 seconds)
  {
    type: 'addNode',
    node: {
      name: 'Typing Delay',
      type: 'n8n-nodes-base.wait',
      typeVersion: 1.1,
      position: [5940, 220],
      parameters: {
        amount: 2,
        unit: 'seconds',
      },
    },
  },
  // 6. Add node: Send WhatsApp Reply 2
  {
    type: 'addNode',
    node: {
      name: 'Send WhatsApp Reply 2',
      type: 'n8n-nodes-base.whatsApp',
      typeVersion: 1.1,
      position: [6180, 220],
      parameters: {
        operation: 'send',
        phoneNumberId: "={{ $('Prepare Updates').first().json.phone_number_id }}",
        recipientPhoneNumber: "={{ $('Prepare Updates').first().json.customer_phone }}",
        textBody: "={{ $('Prepare Updates').first().json.reply_text_2 }}",
        additionalFields: {},
      },
      credentials: {
        whatsAppApi: {
          id: '2uvLAtW94OchN9Gs',
          name: 'WhatsApp account',
        },
      },
    },
  },
  // 7. Set onError continueRegularOutput for Send WhatsApp Reply 2
  {
    type: 'setNodeSettings',
    nodeName: 'Send WhatsApp Reply 2',
    settings: {
      onError: 'continueRegularOutput',
    },
  },
  // 8. Reposition downstream nodes
  {
    type: 'setNodePosition',
    nodeName: 'Log Result',
    position: [6420, 300],
  },
  {
    type: 'setNodePosition',
    nodeName: 'Notify Owner?',
    position: [6660, 300],
  },
  {
    type: 'setNodePosition',
    nodeName: 'Send WhatsApp to Owner',
    position: [6900, 300],
  },
  // 9. Re-wire connections:
  // Remove old connection: Send WhatsApp Reply -> Log Result
  {
    type: 'removeConnection',
    source: 'Send WhatsApp Reply',
    target: 'Log Result',
    sourceIndex: 0,
    targetIndex: 0,
  },
  // Add connection: Send WhatsApp Reply (0) -> Has Second Message? (0)
  {
    type: 'addConnection',
    source: 'Send WhatsApp Reply',
    target: 'Has Second Message?',
    sourceIndex: 0,
    targetIndex: 0,
  },
  // Add connection: Has Second Message? (0 - True) -> Typing Delay (0)
  {
    type: 'addConnection',
    source: 'Has Second Message?',
    target: 'Typing Delay',
    sourceIndex: 0,
    targetIndex: 0,
  },
  // Add connection: Typing Delay (0) -> Send WhatsApp Reply 2 (0)
  {
    type: 'addConnection',
    source: 'Typing Delay',
    target: 'Send WhatsApp Reply 2',
    sourceIndex: 0,
    targetIndex: 0,
  },
  // Add connection: Send WhatsApp Reply 2 (0) -> Log Result (0)
  {
    type: 'addConnection',
    source: 'Send WhatsApp Reply 2',
    target: 'Log Result',
    sourceIndex: 0,
    targetIndex: 0,
  },
  // Add connection: Has Second Message? (1 - False) -> Log Result (0)
  {
    type: 'addConnection',
    source: 'Has Second Message?',
    target: 'Log Result',
    sourceIndex: 1,
    targetIndex: 0,
  },
];

fs.writeFileSync('scripts/two_message_operations.json', JSON.stringify(operations, null, 2));
console.log('Saved', operations.length, 'operations to scripts/two_message_operations.json');
