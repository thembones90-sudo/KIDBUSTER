const testMessages = [];

function getBaseUrl(){
  const configured = process.env.PATHFINDER_APP_URL;
  if(configured) return configured.replace(/\/$/, '');
  if(process.env.KIDBUSTER_TEST_EMAIL === '1') return 'https://pathfinder.test';
  throw new Error('PATHFINDER_APP_URL is not configured');
}

export async function sendAccessVerificationEmail({ email, token, intent }){
  const verificationUrl = getBaseUrl() + '/?access_token=' + encodeURIComponent(token);
  const message = {
    to: email,
    subject: intent === 'signup' ? 'Verify your Pathfinder email' : 'Recover your Pathfinder access',
    text: 'Use this secure link within 15 minutes to access Pathfinder: ' + verificationUrl,
    verificationUrl
  };

  if(process.env.KIDBUSTER_TEST_EMAIL === '1'){
    testMessages.push(message);
    return;
  }

  if(process.env.EMAIL_PROVIDER === 'pathfinder_relay'){
    const endpoint = process.env.PATHFINDER_MAIL_RELAY_URL;
    const token = process.env.PATHFINDER_MAIL_RELAY_TOKEN;
    let url;
    try{ url = new URL(endpoint); }catch{ throw new Error('Email relay is not configured'); }
    if(!token || url.protocol !== 'https:' || url.username || url.password ||
       !url.hostname.endsWith('.up.railway.app') || url.pathname !== '/send'){
      throw new Error('Email relay configuration is invalid');
    }
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, subject: message.subject, text: message.text })
    });
    if(response.status !== 202) throw new Error('Email relay rejected the verification message');
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PATHFINDER_EMAIL_FROM;
  if(process.env.EMAIL_PROVIDER !== 'resend' || !apiKey || !from){
    throw new Error('Email delivery is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [email], subject: message.subject, text: message.text })
  });
  if(!response.ok) throw new Error('Email provider rejected the verification message');
}

// Plain owner notice (alerts). Same transport as the verification email.
export async function sendPlainEmail({ to, subject, text }){
  const message = { to, subject: String(subject || '').slice(0, 150), text: String(text || '').slice(0, 4000) };
  if(process.env.KIDBUSTER_TEST_EMAIL === '1'){ testMessages.push(message); return; }
  if(process.env.EMAIL_PROVIDER === 'pathfinder_relay'){
    const endpoint = process.env.PATHFINDER_MAIL_RELAY_URL;
    const token = process.env.PATHFINDER_MAIL_RELAY_TOKEN;
    let url;
    try{ url = new URL(endpoint); }catch{ throw new Error('Email relay is not configured'); }
    if(!token || url.protocol !== 'https:' || url.username || url.password ||
       !url.hostname.endsWith('.up.railway.app') || url.pathname !== '/send'){
      throw new Error('Email relay configuration is invalid');
    }
    const response = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if(response.status !== 202) throw new Error('Email relay rejected the message');
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PATHFINDER_EMAIL_FROM;
  if(process.env.EMAIL_PROVIDER !== 'resend' || !apiKey || !from) throw new Error('Email delivery is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text })
  });
  if(!response.ok) throw new Error('Email provider rejected the message');
}

export function __getTestMessages(){
  return testMessages.slice();
}

export function __resetTestMessages(){
  testMessages.length = 0;
}
