const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testPrompt() {
  const { data: bizList } = await supabase.from('businesses').select('*');
  const biz = bizList[0];
  const settings = biz.settings || {};

  console.log('Business Name:', biz.name);
  console.log('System Prompt Length:', biz.system_prompt ? biz.system_prompt.length : 0);
  console.log('Settings Keys:', Object.keys(settings));
  console.log('Prices:', settings.prices);
  console.log('Services:', settings.services);
}

testPrompt();
