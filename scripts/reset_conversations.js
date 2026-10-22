const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function resetConversationsAndEscalations() {
  console.log('Deleting conversations for customer_phone: 917250307422...');
  const { data: dConvs, error: err1 } = await supabase
    .from('conversations')
    .delete()
    .eq('customer_phone', '917250307422')
    .select();
  if (err1) console.error('Error deleting conversations:', err1);
  else console.log(`Deleted ${dConvs ? dConvs.length : 0} conversation records.`);

  console.log('Deleting escalations for customer_phone: 917250307422...');
  const { data: dEsc, error: err2 } = await supabase
    .from('escalations')
    .delete()
    .eq('customer_phone', '917250307422')
    .select();
  if (err2) console.error('Error deleting escalations:', err2);
  else console.log(`Deleted ${dEsc ? dEsc.length : 0} escalation records.`);
}

resetConversationsAndEscalations();
