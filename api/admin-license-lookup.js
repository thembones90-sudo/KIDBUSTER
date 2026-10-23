import { getLicense, isFounderLicenseKey, isLicenseExpired } from './_lib/licensing.js';
import { resetManualLicenseClaim, renewManualProLicense, linkRecoveryEmailToLicense } from './_lib/license-service.js';
import { applySubscriptionReconciliation } from './_lib/subscription-reconciliation.js';
import { fetchSubscriptionSnapshot } from './_lib/providers/lemonsqueezy.js';

import { getUsageStatsSnapshot } from './_lib/usage-stats.js';
import adminManualBatchHandler from './_lib/admin-manual-batch.js';

function publicLicenseStatus(license){
  if(!license) return null;
  return {
    plan: license.plan || 'free',
    status: license.status || 'inactive',
    manual: license.manual === true,
    source: license.source || null,
    email: license.email || '',
    createdAt: license.createdAt || null,
    expiresAt: license.expiresAt || null,
    activationPending: license.activationPending === true,
    activatedAt: license.activatedAt || null,
    expired: isLicenseExpired(license),
    claimedAt: license.claimedAt || null,
    claimed: Boolean(license.claimedInstallationId),
    claimedInstallationId: license.claimedInstallationId || null,
    subscriptionStatus: license.subscriptionStatus || null,
    subscriptionEndsAt: license.subscriptionEndsAt || null,
    subscriptionBillingStatus: license.subscriptionBillingStatus || null,
    refundReview: license.subscriptionRefundReview ? {
      kind: license.subscriptionRefundReview.kind || null,
      eventAt: license.subscriptionRefundReview.eventAt || null,
      invoiceId: license.subscriptionRefundReview.invoiceId || null,
      orderId: license.subscriptionRefundReview.orderId || null,
      refundAmount: license.subscriptionRefundReview.refundAmount ?? null,
      total: license.subscriptionRefundReview.total ?? null,
      fullyRefunded: license.subscriptionRefundReview.fullyRefunded === true
    } : null,
    duplicateSubscriptionReview: license.duplicateSubscriptionReview ? {
      previousSubscriptionId: license.duplicateSubscriptionReview.previousSubscriptionId || null,
      previousStatus: license.duplicateSubscriptionReview.previousStatus || null,
      newSubscriptionId: license.duplicateSubscriptionReview.newSubscriptionId || null,
      detectedAt: license.duplicateSubscriptionReview.detectedAt || null
    } : null
  };
}

const LINK_FAILURE_MESSAGES = {
  invalid_email: "Enter the customer's email address.",
  invalid_key: 'That license key was not found.',
  not_paid: 'Only a paid (Pro) license can be linked to a recovery email.',
  email_owned_by_paid_account: 'That email already signs in to another paid account. Nothing was changed; review both keys first.'
};

const RESET_FAILURE_MESSAGES = {
  invalid_key: 'That license key was not found.',
  not_a_manual_key: 'Only manually-issued 30-day keys have a device binding to reset.',
  not_claimed: 'This key has not been claimed by any browser yet -- there is nothing to reset.'
};

export default async function handler(req, res){
  if(req.method !== 'POST' && req.method !== 'GET'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ownerKey = req.headers['x-app-key'];
  if(!isFounderLicenseKey(ownerKey)){
    return res.status(403).json({ error: 'Owner access is required to inspect keys.' });
  }

  // Aggregate usage statistics (owner-only, content-free). GET is read-only and
  // accepts only this action; every other action stays POST.
  const action = String((req.method === 'GET' ? req.query?.action : req.body?.action) || (req.method === 'GET' ? '' : 'lookup')).trim();
  if(action === 'usage-stats'){
    try{
      const snapshot = await getUsageStatsSnapshot();
      if(typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(snapshot);
    }catch(err){
      console.error('admin-license-lookup usage-stats error:', err?.message || 'unknown error');
      return res.status(503).json({ error: 'Usage statistics are temporarily unavailable.', reason: 'stats_unavailable' });
    }
  }
  if(req.method === 'GET'){
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if(['create-batch','preview-retirement','retire-expired'].includes(action)){
    return adminManualBatchHandler(req,res);
  }

  const licenseKey = String(req.body?.licenseKey || '').trim();
  if(!licenseKey){
    return res.status(400).json({ error: 'A license key is required.' });
  }

  // 'lookup' (default, backward compatible) just reports status.
  // 'reset-claim' clears a manual key's device binding so it can be
  // activated again from a different browser -- for a legitimate
  // customer who switched devices or cleared cookies, not a way around
  // the single-claim restriction for anyone else.
  try{
    if(action === 'reconcile-subscription'){
      const result=await applySubscriptionReconciliation(licenseKey,{fetchSnapshot:fetchSubscriptionSnapshot});
      const license=await getLicense(licenseKey);
      return res.status(result.reason==='account_busy'?409:200).json({
        reconciled:result.action==='applied_provider_state'&&result.applied===true,
        result,
        license:publicLicenseStatus(license)
      });
    }
    if(action === 'renew-manual'){
      const result = await renewManualProLicense(licenseKey, 30);
      if(!result.ok){
        return res.status(400).json({
          error: result.reason === 'invalid_key' ? 'That license key was not found.' : 'Only manual Pro licenses can be renewed with this action.',
          license: publicLicenseStatus(result.license)
        });
      }
      return res.status(200).json({
        renewed: true,
        license: publicLicenseStatus(result.license)
      });
    }
    // 'link-email' makes email recovery return this PAID license (for a
    // manual key issued without the customer's email). Only the email index
    // changes; the license record itself is never rewritten.
    if(action === 'link-email'){
      const result = await linkRecoveryEmailToLicense(licenseKey, req.body?.email);
      if(!result.ok){
        return res.status(result.reason === 'email_owned_by_paid_account' ? 409 : 400).json({
          error: LINK_FAILURE_MESSAGES[result.reason] || 'Could not link this email.',
          license: publicLicenseStatus(result.license)
        });
      }
      return res.status(200).json({
        linked: true, unchanged: !!result.unchanged, movedFromFreeAccount: !!result.previousKey && !result.unchanged,
        license: publicLicenseStatus(result.license)
      });
    }
    if(action === 'reset-claim'){
      const result = await resetManualLicenseClaim(licenseKey);
      if(!result.ok){
        return res.status(400).json({
          error: RESET_FAILURE_MESSAGES[result.reason] || 'Could not reset this key.',
          license: publicLicenseStatus(result.license)
        });
      }
      return res.status(200).json({
        reset: true,
        license: publicLicenseStatus(result.license)
      });
    }

    const license = await getLicense(licenseKey);
    return res.status(200).json({
      exists: Boolean(license),
      license: publicLicenseStatus(license)
    });
  }catch(err){
    console.error('admin-license-lookup error:', err);
    return res.status(500).json({ error: 'Could not inspect this key right now.' });
  }
}
