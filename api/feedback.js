// Kidbuster feedback endpoint.
//
// POST: a teacher rates a delivered report (1-5 stars), reports a bug, or
// suggests an idea. The item is stored in Pathfinder's own datastore, joined
// on the server to that report's content-free telemetry (see
// _lib/feedback-store.js). If GOOGLE_SHEET_WEBHOOK_URL is configured, the
// row is also forwarded to the Sheet as before (best effort).
//
// GET: owner only. Returns the aggregated feedback intelligence plus recent
// items. Lives in this handler (not a new file) to stay within the
// deployment's serverless function budget.

import { getLicense, isFounderLicenseKey } from './_lib/licensing.js';
import { FEEDBACK_CATEGORIES, recordFeedback, listFeedback, summarizeFeedback } from './_lib/feedback-store.js';

async function ownerFeedback(req, res){
  if(!isFounderLicenseKey(req.headers['x-app-key'])){
    return res.status(403).json({ error: 'Owner license required' });
  }
  try{
    const items = await listFeedback({ limit: req.query?.limit });
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(200).json({ summary: summarizeFeedback(items), items });
  }catch(err){
    console.error('feedback: owner listing failed:', err);
    return res.status(503).json({ error: 'Feedback store unavailable' });
  }
}

// RADAR VAN routes share this function so the deployment stays within its
// serverless function budget. vercel.json rewrites /api/radar-van-ingest and
// /api/radar-van-session to /api/feedback?radar=ingest|session. Requests
// without that exact parameter take the unchanged feedback path below.
function radarRouteOf(req) {
  let value = req.query?.radar;
  if (value === undefined && req.query === undefined) {
    try { value = new URL(req.url || '/', 'http://x').searchParams.get('radar'); } catch (_err) { value = null; }
  }
  return value === 'ingest' || value === 'session' || value === 'download' ? value : null;
}

async function radarDispatch(route, req, res) {
  if (process.env.RADAR_VAN_ENABLED !== 'true') {
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'RADAR VAN is disabled.' });
  }
  try {
    const module = route === 'ingest'
      ? await import('./_lib/radar-van-ingest-handler.js')
      : route === 'download'
        ? await import('./_lib/radar-van-download-handler.js')
        : await import('./_lib/radar-van-session-handler.js');
    return await module.default(req, res);
  } catch (err) {
    console.error('radar-van dispatch failed:', (err && err.name) || 'error');
    return res.status(503).json({ error: 'RADAR VAN temporarily unavailable.' });
  }
}

export default async function handler(req, res) {
  const radarRoute = radarRouteOf(req);
  if (radarRoute) return radarDispatch(radarRoute, req, res);
  if (req.method === 'GET') return ownerFeedback(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Same lightweight shared-secret gate as /api/generate — keeps random
  // strangers who find the URL from spamming the store with junk rows.
  const expectedKey = process.env.APP_ACCESS_KEY;
  const providedKey = req.headers['x-app-key'];
  let keyAllowed = !!(expectedKey && providedKey === expectedKey);
  if (!keyAllowed && providedKey) {
    try {
      const license = await getLicense(providedKey);
      keyAllowed = isFounderLicenseKey(providedKey) || !!(license && license.status === 'active');
    } catch (err) {
      console.error('feedback license check failed:', err);
      return res.status(500).json({ error: 'Could not verify feedback access right now' });
    }
  }
  if (!keyAllowed) {
    return res.status(401).json({ error: 'Invalid or missing access key' });
  }

  const { teacherName, protocol, ratingTier, score, comment, preplyModule, preplyTrialPerson, generationRef } = req.body || {};
  const category = FEEDBACK_CATEGORIES.includes(req.body?.category) ? req.body.category : 'quality';

  // Stars are required for a quality rating; optional for a bug or an idea,
  // which must instead say something.
  let numericScore = null;
  if (score !== undefined && score !== null && score !== '') {
    numericScore = Number(score);
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
      return res.status(400).json({ error: 'score must be an integer from 1 to 5' });
    }
  }
  const cleanComment = String(comment || '').trim();
  if (category === 'quality' && numericScore === null) {
    return res.status(400).json({ error: 'score must be an integer from 1 to 5' });
  }
  if (category !== 'quality' && !cleanComment) {
    return res.status(400).json({ error: 'Please describe the ' + (category === 'bug' ? 'problem' : 'idea') });
  }

  let stored = null;
  try {
    stored = await recordFeedback({
      licenseKey: providedKey, generationRef, category, score: numericScore, comment: cleanComment,
      teacherName: teacherName || 'Unknown',
      clientContext: { protocol, ratingTier, preplyModule, preplyTrialPerson }
    });
  } catch (err) {
    console.error('feedback: store write failed:', err);
  }

  // Optional Sheet mirror. Trim/cap everything; Preply fields are empty
  // strings (never the literal "null") for non-Preply protocols.
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  let sheet = 'not_configured';
  if (webhookUrl) {
    const payload = {
      timestamp: new Date().toISOString(),
      teacherName: String(teacherName || 'Unknown').slice(0, 100),
      protocol: String(protocol || '').slice(0, 20),
      ratingTier: String(ratingTier || '').slice(0, 30),
      preplyModule: String(preplyModule || '').slice(0, 30),
      preplyTrialPerson: String(preplyTrialPerson || '').slice(0, 30),
      score: numericScore ?? '',
      comment: cleanComment.slice(0, 1000),
      category
    };
    try {
      const sheetResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      sheet = sheetResponse.ok ? 'sent' : 'failed';
    } catch (err) {
      sheet = 'failed';
    }
  }

  if (!stored && sheet !== 'sent') {
    return res.status(502).json({ error: 'Failed to record feedback' });
  }
  return res.status(200).json({ status: 'ok', stored: !!stored, sheet });
}
