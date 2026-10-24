const token = process.env.N8N_API_KEY;
if (!token) throw new Error("N8N_API_KEY must be supplied through the environment");

async function check() {
  const res = await fetch('https://sanskarwhatsapp.app.n8n.cloud/api/v1/executions/264?includeData=true', {
    headers: { 'X-N8N-API-KEY': token, 'Authorization': 'Bearer ' + token }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.slice(0, 500));
}

check();
