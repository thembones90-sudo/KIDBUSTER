'use strict';
// Existing-customer identity and entitlement continuity across the
// kidbuster.vercel.app -> classbuster.com migration. Deterministic: in-memory
// KV, synthetic customers (no real addresses, keys or payment ids), real route
// handlers. This is NOT evidence about live production records.
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-customer-identity-continuity.cjs ===');
  const save={kv:process.env.KIDBUSTER_TEST_KV,owner:process.env.OWNER_LICENSE_KEYS,mail:process.env.KIDBUSTER_TEST_EMAIL};
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.KIDBUSTER_TEST_EMAIL='1';
  process.env.OWNER_LICENSE_KEYS='test_owner_identity_key';
  const OWNER='test_owner_identity_key';
  try{
    const {__resetForTests,__dumpForTests,kv}=await import('../api/_lib/kv-client.js');
    const svc=await import('../api/_lib/license-service.js');
    const lic=await import('../api/_lib/licensing.js');
    const ic=await import('../api/_lib/identity-continuity.js');
    const {applySubscriptionEvent}=await import('../api/_lib/subscription-lifecycle.js');
    const {createVerificationToken}=await import('../api/_lib/account-verification.js');
    const {default:verify}=await import('../api/license-verify.js');
    const {default:status}=await import('../api/license-status.js');
    const {default:admin}=await import('../api/admin-license-lookup.js');
    const {default:signupRoute}=await import('../api/license-signup.js');
    const mail=await import('../api/_lib/email-service.js');
    const {LEGACY_HOST,NEW_HOST}=await import('../api/_lib/legacy-transfer.js');
    __resetForTests();
    async function call(api,{body={},headers={},method='POST'}={}){
      let code=200,payload;
      const res={status(n){code=n;return this;},json(x){payload=x;return this;},setHeader(){}};
      await api({body,headers,method,query:{}},res);
      return {status:code,payload};
    }
    const viaEmail=(address,intent)=>createVerificationToken({email:address,intent}).then(({token})=>call(verify,{body:{token}}));
    const owner=body=>call(admin,{body,headers:{'x-app-key':OWNER}});
    const statusOn=(host,key,id='browser-1')=>call(status,{method:'GET',headers:{'x-app-key':key,'x-installation-id':id,origin:host}});
    const at=days=>new Date(Date.now()+days*864e5).toISOString();
    const pay=(type,key,email,n,when,extra={})=>applySubscriptionEvent({type,licenseKey:key,email,
      paymentCustomerId:'syn_cust_'+n,paymentSubscriptionId:'syn_sub_'+n,orderId:'syn_order_'+n,eventAt:when,...extra});

    // --- Three Lemon Squeezy Pro purchases (synthetic stand-ins) ---
    const buyers=['pro-buyer-one@example.test','pro-buyer-two@example.test','pro-buyer-three@example.test'];
    const proKeys=[];
    for(const [i,address] of buyers.entries()){
      const signup=await viaEmail(address,'signup');
      await pay('payment_succeeded',signup.payload.licenseKey,address,i+1,at(-4));
      proKeys.push(signup.payload.licenseKey);
    }
    await lic.incrementUsage(proKeys[0],lic.currentUsagePeriod());
    const snapshot=JSON.stringify(await lic.getLicense(proKeys[0]));
    for(const [i,address] of buyers.entries()){
      const rec=await viaEmail(address,'recover');
      check('Pro buyer '+(i+1)+' recovers the EXACT original key and Pro plan',rec.status===200&&rec.payload.licenseKey===proKeys[i]&&rec.payload.plan==='pro');
      const again=await viaEmail(address,'signup');
      check('Pro buyer '+(i+1)+' pressing Start Free again gets the same paid key',again.payload.licenseKey===proKeys[i]&&again.payload.plan==='pro');
    }
    const r=await lic.getLicense(proKeys[1]);
    check('subscription ids, order and start date preserved',r.paymentCustomerId==='syn_cust_2'&&r.paymentSubscriptionId==='syn_sub_2'&&r.subscriptionOrderId==='syn_order_2'&&!!r.subscriptionStartedAt);
    check('recovery never rewrites the paid record',JSON.stringify(await lic.getLicense(proKeys[0]))===snapshot);
    const oldHost=await statusOn(LEGACY_HOST,proKeys[0]),newHost=await statusOn(NEW_HOST,proKeys[0]);
    check('same key gives identical status on old and new host',oldHost.status===200&&JSON.stringify(oldHost.payload)===JSON.stringify(newHost.payload)&&newHost.payload.plan==='pro');
    check('usage counter history kept',await lic.getUsageCount(proKeys[0],lic.currentUsagePeriod())===1);

    // --- Renewal and cancellation keep identity ---
    await pay('subscription_renewed',proKeys[2],buyers[2],3,at(-1),{invoiceId:'syn_inv_3'});
    await pay('subscription_cancelled',proKeys[2],buyers[2],3,at(0),{endsAt:at(20)});
    const cancelled=await lic.getLicense(proKeys[2]);
    check('cancelled subscriber keeps same key and Pro until ends_at',cancelled.plan==='pro'&&cancelled.subscriptionStatus==='cancelled'&&cancelled.paymentSubscriptionId==='syn_sub_3');
    check('cancelled subscriber still recovers same key',(await viaEmail(buyers[2],'recover')).payload?.licenseKey===proKeys[2]);

    // --- Purchase email differs from sign-in email ---
    const loginEmail='teacher-login@example.test',purchaseEmail='teacher-billing@example.test';
    const mixed=(await viaEmail(loginEmail,'signup')).payload.licenseKey;
    await pay('payment_succeeded',mixed,purchaseEmail,4,at(-2));
    check('purchase email signs in to the paid account',(await viaEmail(purchaseEmail,'recover')).payload?.licenseKey===mixed);
    check('purchase on a Free signup keeps its original key',(await lic.getLicense(mixed)).plan==='pro');

    // --- Account-stealing: a second buyer pays with an email of an existing Pro ---
    const intruder=(await viaEmail('intruder@example.test','signup')).payload.licenseKey;
    await pay('payment_succeeded',intruder,buyers[0],5,at(-1));
    check('webhook never moves a Pro customer\'s email to another account',await lic.getLicenseKeyByEmail(buyers[0])===proKeys[0]);
    const intruderRec=await lic.getLicense(intruder);
    check('conflicting purchase is flagged for owner review, record email unchanged',!!intruderRec.emailIndexConflict&&intruderRec.email==='intruder@example.test');
    check('original Pro customer still recovers own key after conflict',(await viaEmail(buyers[0],'recover')).payload?.licenseKey===proKeys[0]);
    const legacyPro=await svc.activateOrRenewPro({licenseKey:intruder,email:buyers[1],paymentCustomerId:'syn_cust_6',paymentSubscriptionId:'syn_sub_6'});
    check('legacy activateOrRenewPro also refuses to steal a paid email',legacyPro===intruder&&await lic.getLicenseKeyByEmail(buyers[1])===proKeys[1]);

    // --- Legacy manual paid key issued with no email ---
    const ALPHA='legacy-manual-teacher@example.test';
    const {licenseKey:manual}=await svc.createManualProLicense({note:'legacy no email'});
    check('first browser claims manual key',(await svc.checkEntitlement(manual,'MA','browser-A')).allowed===true);
    check('second browser cannot use the claimed manual key',(await svc.checkEntitlement(manual,'MA','browser-B')).allowed===false);
    await lic.incrementUsage(manual,lic.currentUsagePeriod());
    const manualBefore=JSON.stringify(await lic.getLicense(manual));
    check('unknown verified recovery does not mint Free',(await viaEmail(ALPHA,'recover')).status===409&&await lic.getLicenseKeyByEmail(ALPHA)===null);
    const accidentalFree=(await viaEmail(ALPHA,'signup')).payload.licenseKey;
    check('true new signup for that email still works (Free)',!!accidentalFree&&accidentalFree!==manual&&(await lic.getLicense(accidentalFree)).plan==='free');
    const page=await owner({action:'identity-audit',scope:'licenses',count:200});
    const manualRow=page.payload.rows.find(x=>x.ref===ic.keyFingerprint(manual));
    check('audit marks the email-less manual key as needing key proof',manualRow?.verdict==='needs_key_proof_no_email'&&!manualRow.candidateToken);
    const dry=await owner({action:'identity-repair',email:ALPHA,licenseKey:manual});
    check('repair defaults to dry run and writes nothing',dry.status===200&&dry.payload.dryRun===true&&dry.payload.plan.current==='other_free'&&await lic.getLicenseKeyByEmail(ALPHA)===accidentalFree);
    const noConfirm=await owner({action:'identity-repair',email:ALPHA,licenseKey:manual,dryRun:false});
    check('apply without explicit confirmation is refused',noConfirm.status===400&&noConfirm.payload.reason==='confirmation_required'&&await lic.getLicenseKeyByEmail(ALPHA)===accidentalFree);
    const applied=await owner({action:'identity-repair',email:ALPHA,licenseKey:manual,dryRun:false,confirm:'REPAIR'});
    check('confirmed repair links the email to the ORIGINAL manual key',applied.status===200&&applied.payload.written===true&&await lic.getLicenseKeyByEmail(ALPHA)===manual);
    const back=await viaEmail(ALPHA,'recover');
    check('recovery now returns the original manual Pro key',back.payload?.licenseKey===manual&&back.payload.plan==='pro');
    check('repair kept manual record, device claim and counters intact',JSON.stringify(await lic.getLicense(manual))===manualBefore&&await lic.getUsageCount(manual,lic.currentUsagePeriod())===1&&(await svc.checkEntitlement(manual,'MA','browser-B')).allowed===false);
    check('accidental Free record is kept, not deleted',!!await lic.getLicense(accidentalFree));
    const auditKeys=Object.keys(__dumpForTests()).filter(k=>k.startsWith('identityRepairAudit:'));
    check('repair left exactly one audit-trail record without raw key or email',auditKeys.length===1&&!JSON.stringify(__dumpForTests()[auditKeys[0]]).includes(manual)&&!JSON.stringify(__dumpForTests()[auditKeys[0]]).includes(ALPHA));
    check('repeat repair is idempotent',(await owner({action:'identity-repair',email:ALPHA,licenseKey:manual,dryRun:false,confirm:'REPAIR'})).payload.unchanged===true);

    // --- Paid record with email but missing index (interrupted write) ---
    const gapEmail='gap-subscriber@example.test';
    const gap=(await viaEmail(gapEmail,'signup')).payload.licenseKey;
    await pay('payment_succeeded',gap,gapEmail,7,at(-3));
    await kv.del('email:'+gapEmail);
    check('missing-index recovery refuses rather than forking',(await viaEmail(gapEmail,'recover')).status===409);
    const candidatesBefore=(await kv.scan('0',{match:'identityRepairCandidate:*',count:1000}))[1].length;
    const plainAudit=await owner({action:'identity-audit',scope:'licenses',count:200});
    check('a plain audit mints no candidate tokens and writes nothing',plainAudit.payload.rows.every(r=>!r.candidateToken)&&(await kv.scan('0',{match:'identityRepairCandidate:*',count:1000}))[1].length===candidatesBefore);
    check('audit pages are capped at 50 keys per request',plainAudit.payload.scanned<=50);
    const audit2=await owner({action:'identity-audit',scope:'licenses',count:200,withCandidates:true});
    const gapRow=audit2.payload.rows.find(x=>x.ref===ic.keyFingerprint(gap));
    check('audit finds the paid record with a missing index and offers a candidate',gapRow?.verdict==='repairable_missing_index'&&typeof gapRow.candidateToken==='string');
    const toolShapeDry=await owner({action:'identity-repair',candidateToken:gapRow.candidateToken,email:'',dryRun:true});
    check("dry run with the audit tool's exact request shape (email:'') works",toolShapeDry.status===200&&toolShapeDry.payload.dryRun===true&&toolShapeDry.payload.plan.current==='missing'&&await lic.getLicenseKeyByEmail(gapEmail)===null);
    const tokenDry=await owner({action:'identity-repair',candidateToken:gapRow.candidateToken});
    check('candidate-token dry run works without sending email or key',tokenDry.status===200&&tokenDry.payload.dryRun===true&&tokenDry.payload.plan.current==='missing'&&await lic.getLicenseKeyByEmail(gapEmail)===null);
    const wrongEmail=await owner({action:'identity-repair',email:'someone-else@example.test',candidateToken:gapRow.candidateToken,dryRun:false,confirm:'REPAIR'});
    check('candidate token cannot be redirected to a different email',wrongEmail.payload.reason==='candidate_email_mismatch');
    const viaToken=await owner({action:'identity-repair',email:gapEmail,candidateToken:gapRow.candidateToken,dryRun:false,confirm:'REPAIR'});
    check('candidate-token repair restores the index without exposing the key',viaToken.status===200&&await lic.getLicenseKeyByEmail(gapEmail)===gap);
    check('used candidate token cannot be replayed',(await owner({action:'identity-repair',email:gapEmail,candidateToken:gapRow.candidateToken,dryRun:false,confirm:'REPAIR'})).payload.reason==='candidate_expired');
    check('repaired subscriber recovers same key and ids',(await viaEmail(gapEmail,'recover')).payload?.licenseKey===gap&&(await lic.getLicense(gap)).paymentSubscriptionId==='syn_sub_7');

    // --- Stale index (points to a deleted record) ---
    await lic.saveEmailIndex('stale-teacher@example.test','kb_live_deleted_record_000');
    check('stale index recovery refuses with guidance',(await viaEmail('stale-teacher@example.test','recover')).status===409);
    const staleAudit=await owner({action:'identity-audit',scope:'email-index',count:200});
    check('email-index audit reports the stale pointer',staleAudit.payload.rows.some(x=>x.emailHash===ic.emailHash('stale-teacher@example.test')&&x.verdict==='stale_index_missing_record'));
    const fresh=(await viaEmail('stale-teacher@example.test','signup')).payload;
    check('signup over a stale index gives a REAL account',!!fresh.licenseKey&&!!await lic.getLicense(fresh.licenseKey)&&await lic.getLicenseKeyByEmail('stale-teacher@example.test')===fresh.licenseKey);

    // Same, end to end through the public Start Free route and emailed link.
    await lic.saveEmailIndex('stale-route@example.test','kb_live_deleted_record_001');
    mail.__resetTestMessages();
    const req=await call(signupRoute,{body:{email:'stale-route@example.test'},headers:{'x-forwarded-for':'203.0.113.9'}});
    const sent=mail.__getTestMessages()[0];
    const tokenFromLink=sent?new URL(sent.verificationUrl).searchParams.get('access_token'):null;
    const routed=tokenFromLink?await call(verify,{body:{token:tokenFromLink}}):null;
    check('Start Free over a stale index is not trapped in a failing recovery',req.status===202&&sent?.subject.startsWith('Verify')&&routed?.status===200&&!!await lic.getLicense(routed.payload.licenseKey));

    // --- Concurrency ---
    const many=await Promise.all(Array.from({length:10},()=>svc.getOrCreateFreeLicense('race-teacher@example.test')));
    check('10 concurrent signups converge to one key',new Set(many).size===1);
    const raceKey=many[0];
    const [, signupDuringPay]=await Promise.all([pay('payment_succeeded',raceKey,'race-teacher@example.test',8,at(-1)),svc.getOrCreateFreeLicense('race-teacher@example.test')]);
    check('signup racing a payment returns the same paid account',signupDuringPay===raceKey&&(await lic.getLicense(raceKey)).plan==='pro');

    // --- Negative / safety ---
    const notOwner=await call(admin,{body:{action:'identity-audit'},headers:{'x-app-key':proKeys[0]}});
    check('customers cannot run the identity audit',notOwner.status===403);
    const noKey=await call(admin,{body:{action:'identity-repair',email:ALPHA,licenseKey:manual,dryRun:false,confirm:'REPAIR'},headers:{}});
    check('anonymous repair is refused',noKey.status===403);
    const freeRepair=await owner({action:'identity-repair',email:'someone@example.test',licenseKey:accidentalFree,dryRun:false,confirm:'REPAIR'});
    check('repair cannot point an email at a Free account',freeRepair.payload.reason==='not_paid');
    const steal=await owner({action:'identity-repair',email:buyers[0],licenseKey:manual,dryRun:false,confirm:'REPAIR'});
    check('repair cannot move a Pro customer\'s email to another paid key',steal.status===409&&await lic.getLicenseKeyByEmail(buyers[0])===proKeys[0]);
    const mismatch=await owner({action:'identity-repair',email:'other-mailbox@example.test',licenseKey:proKeys[1],dryRun:false,confirm:'REPAIR'});
    check('record-email mismatch needs explicit evidence',mismatch.payload.reason==='record_email_differs'&&await lic.getLicenseKeyByEmail('other-mailbox@example.test')===null);
    const mismatchOk=await owner({action:'identity-repair',email:'other-mailbox@example.test',licenseKey:proKeys[1],dryRun:false,confirm:'REPAIR',allowEmailMismatch:true,evidence:'LS order syn_order_2 receipt'});
    check('mismatch with evidence links an alias email, record email unchanged',mismatchOk.status===200&&(await lic.getLicense(proKeys[1])).email===buyers[1]);
    check('owner key itself cannot be repaired onto an email',(await owner({action:'identity-repair',email:'x@example.test',licenseKey:OWNER,dryRun:false,confirm:'REPAIR'})).payload.reason==='owner_key');
    const full=JSON.stringify((await owner({action:'identity-audit',scope:'licenses',count:200})).payload)+JSON.stringify((await owner({action:'identity-audit',scope:'email-index',count:200})).payload)+JSON.stringify((await owner({action:'identity-lookup-email',emails:buyers})).payload);
    const leaks=[...proKeys,manual,gap,...buyers,ALPHA,'syn_cust_1','syn_sub_1'].filter(v=>full.includes(v));
    check('audit and lookup output contain no raw keys, emails or payment ids',leaks.length===0);
    const lookup=(await owner({action:'identity-lookup-email',emails:buyers})).payload.results;
    check('owner lookup confirms all three buyers linked to Pro',lookup.length===3&&lookup.every(x=>x.indexState==='linked'&&x.plan==='pro'&&x.recordEmailMatches===true));
    const small=await owner({action:'identity-audit',scope:'licenses',count:2});
    check('audit is bounded and paginated',small.payload.rows.length<=2&&small.payload.done===false&&small.payload.cursor!=='0');
  }catch(error){
    console.log('  FAIL  unexpected error: '+(error?.stack||error));
    check('identity continuity suite completed',false);
  }finally{
    for(const [k,v] of [['KIDBUSTER_TEST_KV',save.kv],['OWNER_LICENSE_KEYS',save.owner],['KIDBUSTER_TEST_EMAIL',save.mail]]){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0);
