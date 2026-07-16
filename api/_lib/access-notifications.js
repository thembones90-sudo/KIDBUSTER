function maskLicenseKey(licenseKey){
  const key = String(licenseKey || '').trim();
  if(!key) return '(none)';
  if(key.length <= 12) return key;
  return key.slice(0, 8) + '...' + key.slice(-4);
}

function compactLines(lines){
  return lines.filter(Boolean).join('\n');
}

export async function notifyAccessEvent({ type, title, email = '', licenseKey = '', details = [] } = {}){
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if(!webhookUrl) return;

  const safeType = String(type || 'access_event').slice(0, 30);
  const safeEmail = String(email || '').slice(0, 160);
  const comment = compactLines([
    title || 'Pathfinder access event.',
    safeEmail ? 'Email: ' + safeEmail : '',
    licenseKey ? 'Key: ' + maskLicenseKey(licenseKey) : '',
    ...details.map(line => String(line || '').slice(0, 300))
  ]).slice(0, 1000);

  try{
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        teacherName: 'License System',
        protocol: 'LICENSE',
        ratingTier: safeType,
        score: '',
        comment,
        preplyModule: '',
        preplyTrialPerson: ''
      })
    });
    if(!response.ok){
      console.error('access notification failed:', safeType, response.status);
    }
  }catch(err){
    console.error('access notification error:', safeType, err);
  }
}
