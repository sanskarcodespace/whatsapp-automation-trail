const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLatestMessages() {
  const { data, error } = await supabase.from('wa_messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Error:', error);
  console.log('Recent messages count:', data ? data.length : 0);
  if (data && data.length) console.log('Messages:', JSON.stringify(data, null, 2));
}

checkLatestMessages();
