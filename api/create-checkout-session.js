// Pathfinder V2 checkout: ownership-verification is a prerequisite.
// An email address must never be a way to read another teacher's key.
// No live payment runs in V2's isolated localhost preview.
import { getActiveProvider } from './_lib/providers/index.js';
import { getLicense, normalizeEmail, isFounderLicenseKey } from './_lib/licensing.js';
import { requestVerifiedAccess } from './_lib/access-request.js';
import { notifyAccessEvent } from './_lib/access-notifications.js';

function isValidEmail(email){
  return typeof email === 'string' && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const suppliedEmail = req.body?.email;
  const providedLicenseKey = req.body?.licenseKey;
  const action = req.body?.action === 'manage-billing' ? 'manage-billing' : 'checkout';
  const authKey = String(req.headers?.['x-app-key'] || '').trim();

  // Public preview deployments use a test payment catalogue. Never offer a
  // test-mode checkout as though it could accept a customer's real card.
  if(action === 'checkout' && process.env.VERCEL_ENV === 'preview'){
    res.setHeader('Cache-Control', 'no-store');
    return res.status(409).json({
      error: 'This is a test preview, not a live payment site. For a real subscription, open https://kidbuster.vercel.app and sign in there.'
    });
  }

  try{
    if(!authKey){
      if(providedLicenseKey){
        return res.status(401).json({
          error: 'Please sign in with your existing access key before checkout.'
        });
      }
      // Direct-to-Pro visitor: verify email ownership FIRST. This returns
      // 202 and NO license key or checkout URL. The user completes the
      // emailed link and can then initiate checkout as the signed-in owner.
      if(!isValidEmail(suppliedEmail)){
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      return await requestVerifiedAccess(req, res, {intent:'signup'});
    }

    // The owner key is for administration, not a purchasable subscription.
    if(isFounderLicenseKey(authKey)){
      return res.status(403).json({error:'Owner accounts cannot start customer checkout.'});
    }
    if(providedLicenseKey && providedLicenseKey !== authKey){
      return res.status(403).json({error:'Checkout access key does not match the signed-in account.'});
    }

    const license = await getLicense(authKey);
    if(!license || license.status !== 'active'){
      return res.status(401).json({error:'Please sign in with an active access key.'});
    }
    const provider = getActiveProvider();
    if(action === 'manage-billing'){
      if(!license.paymentSubscriptionId || !license.paymentCustomerId){
        return res.status(409).json({error:'This account does not have a provider-managed subscription.'});
      }
      const url = await provider.createCustomerPortalUrl({
        subscriptionId:license.paymentSubscriptionId,
        customerId:license.paymentCustomerId
      });
      return res.status(200).json({url});
    }
    if(license.paymentSubscriptionId && license.subscriptionStatus !== 'expired' &&
        !(license.subscriptionStatus === 'cancelled' && license.subscriptionEndsAt &&
          Date.parse(license.subscriptionEndsAt) <= Date.now())){
      return res.status(409).json({error:'This account already has a subscription. Manage your existing subscription instead.'});
    }
    const verifiedEmail = normalizeEmail(license.email || '');
    const normalizedSupplied = typeof suppliedEmail === 'string' ? normalizeEmail(suppliedEmail) : '';
    if(normalizedSupplied && !isValidEmail(normalizedSupplied)){
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if(verifiedEmail && normalizedSupplied && normalizedSupplied !== verifiedEmail){
      return res.status(403).json({error:'Checkout email must match your verified account email.'});
    }
    const checkoutEmail = verifiedEmail || normalizedSupplied;
    if(!checkoutEmail || !isValidEmail(checkoutEmail)){
      return res.status(400).json({error:'Your account needs a valid billing email for checkout.'});
    }

    const url = await provider.createCheckoutUrl({email:checkoutEmail,licenseKey:authKey});
    await notifyAccessEvent({
      type:'pro_checkout_started',
      title:'Pro checkout started.',
      email:checkoutEmail,
      licenseKey:authKey,
      details:['Provider: ' + (process.env.PAYMENT_PROVIDER || 'lemonsqueezy')]
    });

    // The signed-in browser already holds this key: no reason to echo it.
    return res.status(200).json({url});
  }catch(err){
    console.error('create-checkout-session error:',err);
    return res.status(500).json({error:action === 'manage-billing'
      ? 'Could not open billing right now. Please try again shortly.'
      : 'Could not start checkout right now. Please try again shortly.'});
  }
}
