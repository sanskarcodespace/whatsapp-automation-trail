const fs = require('fs');

const updatedWf = JSON.parse(fs.readFileSync('/Users/sanskar/whatspp automation trail/whatsapp-automation-trail/workflows/whatsapp_multi_client_ai.json', 'utf8'));

const operations = [];

// 1. updateNodeParameters for Validate Message
const valMsg = updatedWf.nodes.find(n => n.name === 'Validate Message');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Validate Message',
  parameters: valMsg.parameters
});

// 2. updateNodeParameters for Check Duplicates
const checkDup = updatedWf.nodes.find(n => n.name === 'Check Duplicates');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Check Duplicates',
  parameters: checkDup.parameters
});

// 3. removeConnection: Check Duplicates -> Identify Business
operations.push({
  type: 'removeConnection',
  source: 'Check Duplicates',
  target: 'Identify Business',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 4. addNode: Debounce Quiet Window
const debounceWait = updatedWf.nodes.find(n => n.name === 'Debounce Quiet Window');
operations.push({
  type: 'addNode',
  node: {
    name: debounceWait.name,
    type: debounceWait.type,
    typeVersion: debounceWait.typeVersion,
    position: debounceWait.position,
    parameters: debounceWait.parameters
  }
});

// 5. addNode: Fetch Recent Messages
const fetchBuf = updatedWf.nodes.find(n => n.name === 'Fetch Recent Messages');
operations.push({
  type: 'addNode',
  node: {
    name: fetchBuf.name,
    type: fetchBuf.type,
    typeVersion: fetchBuf.typeVersion,
    position: fetchBuf.position,
    credentials: fetchBuf.credentials,
    parameters: fetchBuf.parameters
  }
});

// 6. addNode: Aggregate & Check Winner
const aggNode = updatedWf.nodes.find(n => n.name === 'Aggregate & Check Winner');
operations.push({
  type: 'addNode',
  node: {
    name: aggNode.name,
    type: aggNode.type,
    typeVersion: aggNode.typeVersion,
    position: aggNode.position,
    parameters: aggNode.parameters
  }
});

// 7. addNode: Should Process Batch?
const spNode = updatedWf.nodes.find(n => n.name === 'Should Process Batch?');
operations.push({
  type: 'addNode',
  node: {
    name: spNode.name,
    type: spNode.type,
    typeVersion: spNode.typeVersion,
    position: spNode.position,
    parameters: spNode.parameters
  }
});

// 8. addNode: Has Quoted Message?
const hqNode = updatedWf.nodes.find(n => n.name === 'Has Quoted Message?');
operations.push({
  type: 'addNode',
  node: {
    name: hqNode.name,
    type: hqNode.type,
    typeVersion: hqNode.typeVersion,
    position: hqNode.position,
    parameters: hqNode.parameters
  }
});

// 9. addNode: Fetch Quoted Message
const fqNode = updatedWf.nodes.find(n => n.name === 'Fetch Quoted Message');
operations.push({
  type: 'addNode',
  node: {
    name: fqNode.name,
    type: fqNode.type,
    typeVersion: fqNode.typeVersion,
    position: fqNode.position,
    credentials: fqNode.credentials,
    parameters: fqNode.parameters
  }
});

// 10. addNode: Resolve Quoted Data
const rqNode = updatedWf.nodes.find(n => n.name === 'Resolve Quoted Data');
operations.push({
  type: 'addNode',
  node: {
    name: rqNode.name,
    type: rqNode.type,
    typeVersion: rqNode.typeVersion,
    position: rqNode.position,
    parameters: rqNode.parameters
  }
});

// 11. addNode: Pass Direct Message
const pdNode = updatedWf.nodes.find(n => n.name === 'Pass Direct Message');
operations.push({
  type: 'addNode',
  node: {
    name: pdNode.name,
    type: pdNode.type,
    typeVersion: pdNode.typeVersion,
    position: pdNode.position,
    parameters: pdNode.parameters
  }
});

// 12. addConnection: Check Duplicates -> Debounce Quiet Window
operations.push({
  type: 'addConnection',
  source: 'Check Duplicates',
  target: 'Debounce Quiet Window',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 13. addConnection: Debounce Quiet Window -> Fetch Recent Messages
operations.push({
  type: 'addConnection',
  source: 'Debounce Quiet Window',
  target: 'Fetch Recent Messages',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 14. addConnection: Fetch Recent Messages -> Aggregate & Check Winner
operations.push({
  type: 'addConnection',
  source: 'Fetch Recent Messages',
  target: 'Aggregate & Check Winner',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 15. addConnection: Aggregate & Check Winner -> Should Process Batch?
operations.push({
  type: 'addConnection',
  source: 'Aggregate & Check Winner',
  target: 'Should Process Batch?',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 16. addConnection: Should Process Batch? (True: 0) -> Has Quoted Message?
operations.push({
  type: 'addConnection',
  source: 'Should Process Batch?',
  target: 'Has Quoted Message?',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 17. addConnection: Should Process Batch? (False: 1) -> Duplicate or DB Error - Stop
operations.push({
  type: 'addConnection',
  source: 'Should Process Batch?',
  target: 'Duplicate or DB Error - Stop',
  connectionType: 'main',
  sourceIndex: 1,
  targetIndex: 0
});

// 18. addConnection: Has Quoted Message? (True: 0) -> Fetch Quoted Message
operations.push({
  type: 'addConnection',
  source: 'Has Quoted Message?',
  target: 'Fetch Quoted Message',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 19. addConnection: Has Quoted Message? (False: 1) -> Pass Direct Message
operations.push({
  type: 'addConnection',
  source: 'Has Quoted Message?',
  target: 'Pass Direct Message',
  connectionType: 'main',
  sourceIndex: 1,
  targetIndex: 0
});

// 20. addConnection: Fetch Quoted Message -> Resolve Quoted Data
operations.push({
  type: 'addConnection',
  source: 'Fetch Quoted Message',
  target: 'Resolve Quoted Data',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 21. addConnection: Resolve Quoted Data -> Identify Business
operations.push({
  type: 'addConnection',
  source: 'Resolve Quoted Data',
  target: 'Identify Business',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 22. addConnection: Pass Direct Message -> Identify Business
operations.push({
  type: 'addConnection',
  source: 'Pass Direct Message',
  target: 'Identify Business',
  connectionType: 'main',
  sourceIndex: 0,
  targetIndex: 0
});

// 23. updateNodeParameters for Identify Business
const idBiz = updatedWf.nodes.find(n => n.name === 'Identify Business');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Identify Business',
  parameters: idBiz.parameters
});

// 24. updateNodeParameters for Resolve Business
const resBiz = updatedWf.nodes.find(n => n.name === 'Resolve Business');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Resolve Business',
  parameters: resBiz.parameters
});

// 25. updateNodeParameters for Fetch Existing Lead
const fLead = updatedWf.nodes.find(n => n.name === 'Fetch Existing Lead');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Fetch Existing Lead',
  parameters: fLead.parameters
});

// 26. updateNodeParameters for Retrieve Chat History
const rHist = updatedWf.nodes.find(n => n.name === 'Retrieve Chat History');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Retrieve Chat History',
  parameters: rHist.parameters
});

// 27. updateNodeParameters for Check Human Takeover
const cHuman = updatedWf.nodes.find(n => n.name === 'Check Human Takeover');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Check Human Takeover',
  parameters: cHuman.parameters
});

// 28. updateNodeParameters for Build AI Context
const bCtx = updatedWf.nodes.find(n => n.name === 'Build AI Context');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Build AI Context',
  parameters: bCtx.parameters
});

// 29. updateNodeParameters for AI Agent
const agent = updatedWf.nodes.find(n => n.name === 'AI Agent');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'AI Agent',
  parameters: agent.parameters
});

// 30. updateNodeParameters for Structured Reply Parser
const parser = updatedWf.nodes.find(n => n.name === 'Structured Reply Parser');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Structured Reply Parser',
  parameters: parser.parameters
});

// 31. updateNodeParameters for Prepare Updates
const prep = updatedWf.nodes.find(n => n.name === 'Prepare Updates');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Prepare Updates',
  parameters: prep.parameters
});

// 32. updateNodeParameters for Log Result
const logR = updatedWf.nodes.find(n => n.name === 'Log Result');
operations.push({
  type: 'updateNodeParameters',
  nodeName: 'Log Result',
  parameters: logR.parameters
});

console.log('Total operations built:', operations.length);
fs.writeFileSync('/Users/sanskar/whatspp automation trail/whatsapp-automation-trail/scripts/operations.json', JSON.stringify(operations, null, 2), 'utf8');
