const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const cleanSystemPrompt = `You represent Amolik Group, a premier developer in Faridabad, Delhi NCR.
Your role is to assist buyers with accurate project information, pricing, and locations in a warm, helpful, natural manner.

STRICT CONVERSATIONAL POLICIES:
1. NEVER PUSH SITE VISITS ON YOUR OWN: Do NOT ask "Kya aap site visit schedule karna chahenge?" or suggest visits after every message. Only discuss a visit if the customer specifically asks to visit.
2. STRICT BHK INTEGRITY: When a customer mentions a specific BHK (e.g. 2 BHK), talk ONLY about that BHK. Never switch to 1 BHK or 3 BHK unless the customer asks for other BHK options.
3. NO REPETITIVE EMOJIS: Do not put smiling emojis (😊) at the end of messages. Write clean, natural text.
4. NATURAL HUMAN TONE: Sound like a genuine, knowledgeable local property advisor on WhatsApp. Keep messages concise and conversational.`;

async function updatePrompt() {
  console.log('Updating business system_prompt in Supabase...');
  const { data, error } = await supabase
    .from('businesses')
    .update({ system_prompt: cleanSystemPrompt })
    .eq('phone_number_id', '1383698251495317')
    .select('id, name, system_prompt');

  if (error) {
    console.error('Error updating system_prompt:', error);
  } else {
    console.log('✅ Successfully updated system_prompt in Supabase:');
    console.log(data[0].system_prompt);
  }
}

updatePrompt();
