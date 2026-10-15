// V2 previews must never send synthetic lessons into the original live app.
export function krispWebhookUrlForToken(token){
  const origin = process.env.VERCEL_ENV === 'preview'
    ? 'https://pathfinder-v2-staging-preview.vercel.app'
    : 'https://kidbuster.vercel.app';
  return origin + '/api/krisp-webhook?token=' + encodeURIComponent(token);
}
