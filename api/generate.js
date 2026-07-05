// Kidbuster secure backend proxy.
//
// This is the ONLY place the real Anthropic API key ever exists. It lives
// in a Vercel environment variable, never in git, never in the browser.
// The frontend (index.html) sends a fully-built systemPrompt + userMessage
// here; this function attaches the real API key server-side, calls
// Anthropic, and relays the result back. It has zero knowledge of MA/OF,
// protocols, or validation — that logic stays entirely in KidbusterCore on
// the frontend. This function's only job is: authenticate the request,
// hide the key, proxy the call.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- lightweight shared-secret gate ---
  // Not a real auth system — no accounts, no per-user identity. Just
  // enough to stop a bare public URL from being freely usable by anyone
  // who stumbles on it. Set APP_ACCESS_KEY in Vercel's environment
  // variables; the frontend prompts the user for this once and remembers
  // it in localStorage.
  const expectedKey = process.env.APP_ACCESS_KEY;
  if (expectedKey) {
    const providedKey = req.headers['x-app-key'];
    if (providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Invalid or missing access key' });
    }
  }

  const { systemPrompt, userMessage } = req.body || {};
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid systemPrompt' });
  }
  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid userMessage' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set in the environment');
    return res.status(500).json({ error: 'Server is not configured correctly (missing API key)' });
  }

  let anthropicResponse;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (networkErr) {
    return res.status(502).json({ error: 'Network error contacting Anthropic' });
  }

  if (!anthropicResponse.ok) {
    let detail = '';
    try {
      const errBody = await anthropicResponse.json();
      detail = (errBody && errBody.error && errBody.error.message) || '';
    } catch (e) { /* body wasn't JSON, ignore */ }
    return res.status(anthropicResponse.status).json({
      error: detail || ('Anthropic API request failed with status ' + anthropicResponse.status)
    });
  }

  const data = await anthropicResponse.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();

  if (!text) {
    return res.status(502).json({ error: 'Anthropic returned an empty response' });
  }

  return res.status(200).json({ text, usage: data.usage || null });
}
