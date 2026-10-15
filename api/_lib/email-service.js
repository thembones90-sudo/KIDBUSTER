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

export function __getTestMessages(){
  return testMessages.slice();
}

export function __resetTestMessages(){
  testMessages.length = 0;
}
