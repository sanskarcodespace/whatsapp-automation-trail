const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function clearChatHistory() {
  console.log('Clearing messages for customer_phone: 917250307422...');
  const { data: dMsgs, error: err1 } = await supabase
    .from('wa_messages')
    .delete()
    .eq('customer_phone', '917250307422')
    .select();
  
  if (err1) console.error('Error deleting wa_messages:', err1);
  else console.log(`Deleted ${dMsgs.length} messages from wa_messages.`);

  console.log('Clearing leads for customer_phone: 917250307422...');
  const { data: dLeads, error: err2 } = await supabase
    .from('leads')
    .delete()
    .eq('customer_phone', '917250307422')
    .select();

  if (err2) console.error('Error deleting leads:', err2);
  else console.log(`Deleted ${dLeads ? dLeads.length : 0} leads from leads table.`);
}

clearChatHistory();
