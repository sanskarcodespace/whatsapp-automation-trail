const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testLeadUpsert() {
  const testLead = {
    business_id: 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb',
    customer_phone: '917250307422',
    customer_name: 'Test Upsert',
    status: 'new'
  };

  const { data, error } = await supabase
    .from('leads')
    .upsert(testLead, { onConflict: 'business_id,customer_phone' })
    .select();

  console.log('Upsert result error:', error);
  console.log('Upsert data:', data);

  // Clean up
  await supabase.from('leads').delete().eq('customer_phone', '917250307422');
}

testLeadUpsert();
