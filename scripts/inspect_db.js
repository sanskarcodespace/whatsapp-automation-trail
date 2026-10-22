const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  console.log('--- BUSINESSES ---');
  const { data: businesses, error: bErr } = await supabase.from('businesses').select('*');
  if (bErr) console.error('bErr:', bErr);
  else console.log(JSON.stringify(businesses, null, 2));

  console.log('\n--- RECENT MESSAGES ---');
  const { data: msgs, error: mErr } = await supabase.from('wa_messages').select('*').order('created_at', { ascending: false }).limit(10);
  if (mErr) console.error('mErr:', mErr);
  else console.log(JSON.stringify(msgs, null, 2));

  console.log('\n--- LEADS ---');
  const { data: leads, error: lErr } = await supabase.from('leads').select('*').limit(10);
  if (lErr) console.error('lErr:', lErr);
  else console.log(JSON.stringify(leads, null, 2));
}

inspect();
