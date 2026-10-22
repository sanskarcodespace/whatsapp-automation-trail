const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRecentActivity() {
  const { data: convs } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false }).limit(5);
  console.log('Conversations:', JSON.stringify(convs, null, 2));

  const { data: leads } = await supabase.from('leads').select('*').order('updated_at', { ascending: false }).limit(5);
  console.log('Leads:', JSON.stringify(leads, null, 2));

  const { data: esc } = await supabase.from('escalations').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Escalations:', JSON.stringify(esc, null, 2));
}

checkRecentActivity();
