const fs = require('fs');

const token = process.env.N8N_API_KEY;
if (!token) throw new Error("N8N_API_KEY must be supplied through the environment");

// Read current live workflow
const wf = JSON.parse(fs.readFileSync('workflows/whatsapp_multi_client_ai.json', 'utf8'));

// 1. Fix Resolve Business jsCode to ensure customer message data is never lost!
const resBiz = wf.nodes.find(n => n.name === 'Resolve Business');
resBiz.parameters.jsCode = `const cfg = $('Workflow Config').first().json;
// Get the customer message data with combined text & quoted context:
let msg = null;
try { msg = $('Pass Direct Message').first()?.json; } catch (e) {}
if (!msg || !msg.customer_phone) {
  try { msg = $('Resolve Quoted Data').first()?.json; } catch (e) {}
}
if (!msg || !msg.customer_phone) {
  try { msg = $('Aggregate & Check Winner').first()?.json; } catch (e) {}
}
if (!msg || !msg.customer_phone) {
  msg = $('Validate Message').first().json;
}

// Business rows retrieved from Supabase
const bizRows = $('Identify Business').all().map(i => i.json).filter(r => r && r.id);
let business = null;
let source = 'none';

if (bizRows.length) {
  business = bizRows[0];
  source = 'supabase';
} else if (cfg.test_mode === true && (!cfg.test_phone_number_id || String(cfg.test_phone_number_id) === String(msg.phone_number_id))) {
  business = {
    id: cfg.test_business_id || 'biz_test',
    name: cfg.test_business_name,
    phone_number_id: msg.phone_number_id,
    services: cfg.test_services,
    products: '',
    prices: '',
    faqs: cfg.test_faqs,
    opening_hours: cfg.test_opening_hours,
    ai_tone: cfg.test_ai_tone,
    contact_details: cfg.test_contact_details,
    booking_system: null,
    handoff_message: '',
  };
  source = 'test_config';
}

return [{ json: {
  ...msg,
  business_found: !!business,
  business_source: source,
  business: business || {},
} }];`;

// 2. Fix Identify Business filter
const idBiz = wf.nodes.find(n => n.name === 'Identify Business');
idBiz.parameters.filters.conditions[0].keyValue = `={{ $('Pass Direct Message').first()?.json?.phone_number_id || $('Resolve Quoted Data').first()?.json?.phone_number_id || $('Aggregate & Check Winner').first().json.phone_number_id }}`;

// 3. Clean horizontal layout positions for all 41 nodes
const positions = {
  "WhatsApp Trigger": [0, 200],
  "Workflow Config": [240, 200],
  "Validate Message": [480, 200],
  "Check Duplicates": [720, 200],
  "Duplicate or DB Error - Stop": [960, 440],
  "Debounce Quiet Window": [960, 200],
  "Fetch Recent Messages": [1200, 200],
  "Aggregate & Check Winner": [1440, 200],
  "Should Process Batch?": [1680, 200],
  "Has Quoted Message?": [1920, 200],
  "Fetch Quoted Message": [2160, 100],
  "Resolve Quoted Data": [2400, 100],
  "Pass Direct Message": [2160, 300],
  "Identify Business": [2640, 200],
  "Resolve Business": [2880, 200],
  "Business Known?": [3120, 200],
  "Log Unknown Business": [3360, 440],
  "Fetch Business Data": [3360, 200],
  "Fetch Existing Lead": [3600, 200],
  "Retrieve Chat History": [3840, 200],
  "Check Human Takeover": [4080, 200],
  "Build AI Context": [4320, 200],
  "Bot Active?": [4560, 200],
  "Human Handling - No Auto Reply": [4800, 440],
  "AI Agent": [4800, 200],
  "OpenAI Chat Model": [4800, 420],
  "Structured Reply Parser": [4980, 420],
  "AI Failure Fallback": [5040, 320],
  "Prepare Updates": [5220, 200],
  "Update Conversation": [5460, 80],
  "Update Lead": [5700, 80],
  "Appointment Requested?": [5940, 80],
  "Save Appointment Request": [6180, 20],
  "Handoff Needed?": [6180, 80],
  "Record Escalation": [6420, 20],
  "Records Saved": [6420, 80],
  "Send WhatsApp Reply": [5460, 300],
  "Log Result": [5700, 300],
  "Log Send Failure": [5700, 460],
  "Notify Owner?": [5940, 300],
  "Send WhatsApp to Owner": [6180, 300]
};

// Apply positions
for (const [nodeName, pos] of Object.entries(positions)) {
  const node = wf.nodes.find(n => n.name === nodeName);
  if (node) {
    node.position = pos;
  }
}

// Build MCP update operations
const operations = [
  // 1. Update parameters of Resolve Business
  {
    type: 'updateNodeParameters',
    nodeName: 'Resolve Business',
    parameters: resBiz.parameters
  },
  // 2. Update parameters of Identify Business
  {
    type: 'updateNodeParameters',
    nodeName: 'Identify Business',
    parameters: idBiz.parameters
  }
];

// Add setNodePosition for all nodes
for (const [nodeName, pos] of Object.entries(positions)) {
  operations.push({
    type: 'setNodePosition',
    nodeName: nodeName,
    position: pos
  });
}

console.log('Sending', operations.length, 'operations to n8n MCP API...');

const rpcBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'update_workflow',
    arguments: {
      workflowId: 'FjdX8g9eDzTtx1Dc',
      versionName: 'Fix Resolve Business context passing & clean canvas layout',
      versionDescription: 'Fixed critical bug in Resolve Business where customer phone and message were overwritten by business row, and reorganized canvas positions with clean spacing.',
      operations: operations
    }
  }
};

fetch('https://sanskarwhatsapp.app.n8n.cloud/mcp-server/http', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify(rpcBody)
})
.then(r => r.text())
.then(res => {
  console.log('Update result snippet:', res.slice(0, 1000));
})
.catch(err => console.error('Fetch error:', err));
