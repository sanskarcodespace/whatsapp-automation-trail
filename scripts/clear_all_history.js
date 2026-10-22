const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function clearAllHistory() {
  console.log('Clearing all message & conversation history...');

  // 1. Delete wa_messages
  const { data: dMsgs, error: errMsgs } = await supabase
    .from('wa_messages')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select();
  if (errMsgs) console.error('Error deleting wa_messages:', errMsgs);
  else console.log(`✅ Deleted ${dMsgs.length} records from wa_messages.`);

  // 2. Delete conversations
  const { data: dConvs, error: errConvs } = await supabase
    .from('conversations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select();
  if (errConvs) console.error('Error deleting conversations:', errConvs);
  else console.log(`✅ Deleted ${dConvs ? dConvs.length : 0} records from conversations.`);

  // 3. Delete leads
  const { data: dLeads, error: errLeads } = await supabase
    .from('leads')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select();
  if (errLeads) console.error('Error deleting leads:', errLeads);
  else console.log(`✅ Deleted ${dLeads ? dLeads.length : 0} records from leads.`);

  // 4. Delete escalations
  const { data: dEsc, error: errEsc } = await supabase
    .from('escalations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select();
  if (errEsc) console.error('Error deleting escalations:', errEsc);
  else console.log(`✅ Deleted ${dEsc ? dEsc.length : 0} records from escalations.`);

  console.log('\nAll conversation and test history has been completely cleared!');
}

clearAllHistory();
