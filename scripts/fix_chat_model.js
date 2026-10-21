const fs = require('fs');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjZkOGY5Mi1jMzQ5LTQ1NWUtOWQ2MS01MWU3NjczYTY1NzUiLCJpc3MiOiJuOG4iLCJqdGkiOiIyNDQ5OTlkYS0yZmIzLTRjY2UtOGI4Ny05OGM3OTlmMDgzNzkiLCJpYXQiOjE3OTI1MTE4MzQsImF1ZCI6Im1jcC1zZXJ2ZXItYXBpIn0.G64W-Qbu2nr0dOivFmXOmDItxTNM_IJWamdwjDWLCFk';

const operations = [
  // 1. Remove Google Gemini connection
  {
    type: 'removeConnection',
    source: 'Google Gemini Chat Model',
    target: 'AI Agent',
    connectionType: 'ai_languageModel',
    sourceIndex: 0,
    targetIndex: 0
  },
  // 2. Remove Google Gemini node
  {
    type: 'removeNode',
    nodeName: 'Google Gemini Chat Model'
  },
  // 3. Add back OpenAI Chat Model (gpt-4o-mini, maxTokens: 250, temperature: 0.3)
  {
    type: 'addNode',
    node: {
      name: 'OpenAI Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.3,
      position: [4440, 320],
      parameters: {
        model: {
          __rl: true,
          mode: 'list',
          value: 'gpt-4o-mini',
          cachedResultName: 'gpt-4o-mini'
        },
        options: {
          maxTokens: 250,
          temperature: 0.3
        }
      }
    }
  },
  // 4. Connect OpenAI Chat Model to AI Agent
  {
    type: 'addConnection',
    source: 'OpenAI Chat Model',
    target: 'AI Agent',
    connectionType: 'ai_languageModel',
    sourceIndex: 0,
    targetIndex: 0
  },
  // 5. Ensure AI Agent has onError: continueErrorOutput so it never crashes the workflow
  {
    type: 'setNodeSettings',
    nodeName: 'AI Agent',
    settings: {
      onError: 'continueErrorOutput'
    }
  },
  // 6. Ensure Fetch Recent Messages has onError: continueRegularOutput and alwaysOutputData: true
  {
    type: 'setNodeSettings',
    nodeName: 'Fetch Recent Messages',
    settings: {
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    }
  },
  // 7. Ensure Fetch Quoted Message has onError: continueRegularOutput and alwaysOutputData: true
  {
    type: 'setNodeSettings',
    nodeName: 'Fetch Quoted Message',
    settings: {
      onError: 'continueRegularOutput',
      alwaysOutputData: true
    }
  }
];

const rpcBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'update_workflow',
    arguments: {
      workflowId: 'FjdX8g9eDzTtx1Dc',
      versionName: 'Switch to ultra-optimized gpt-4o-mini with error shields',
      versionDescription: 'Switched back to OpenAI gpt-4o-mini with 250 maxTokens cap, compressed context, and error shields on all lookup nodes to prevent workflow crashes.',
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
  console.log('Update result:', res.slice(0, 1000));
})
.catch(err => console.error('Fetch error:', err));
