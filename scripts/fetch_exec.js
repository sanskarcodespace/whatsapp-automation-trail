const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjZkOGY5Mi1jMzQ5LTQ1NWUtOWQ2MS01MWU3NjczYTY1NzUiLCJpc3MiOiJuOG4iLCJqdGkiOiIyNDQ5OTlkYS0yZmIzLTRjY2UtOGI4Ny05OGM3OTlmMDgzNzkiLCJpYXQiOjE3OTI1MTE4MzQsImF1ZCI6Im1jcC1zZXJ2ZXItYXBpIn0.G64W-Qbu2nr0dOivFmXOmDItxTNM_IJWamdwjDWLCFk';

async function check() {
  const res = await fetch('https://sanskarwhatsapp.app.n8n.cloud/api/v1/executions/264?includeData=true', {
    headers: { 'X-N8N-API-KEY': token, 'Authorization': 'Bearer ' + token }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.slice(0, 500));
}

check();
