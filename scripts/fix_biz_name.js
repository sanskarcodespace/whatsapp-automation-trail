const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fixBusinessName() {
  const { data, error } = await supabase
    .from('businesses')
    .update({ name: 'Amolik Housing' })
    .eq('id', 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb')
    .select();

  console.log('Update error:', error);
  console.log('Updated business:', data ? data[0].name : null);
}

fixBusinessName();
