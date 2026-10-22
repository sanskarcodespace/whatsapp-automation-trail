const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkFailedMessage() {
  const { data, error } = await supabase.from('wa_messages').select('*').eq('wa_message_id', 'failed_264');
  console.log('Error:', error);
  console.log('Record:', JSON.stringify(data, null, 2));
}

checkFailedMessage();
