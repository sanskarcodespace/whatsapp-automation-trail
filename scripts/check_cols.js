const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data } = await supabase.from('businesses').select('*');
  const b = data[0];
  const keys = Object.keys(b);
  console.log('Keys:', keys);
  keys.forEach(k => {
    if (k !== 'settings') console.log(`${k}:`, b[k]);
  });
}

checkCols();
