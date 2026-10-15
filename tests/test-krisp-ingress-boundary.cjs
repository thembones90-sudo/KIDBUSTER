'use strict';
const assert = require('node:assert/strict');
const route = require('../tools/staging/krisp-ingress-route.json');
module.exports = async function(){
  const denied = new RegExp(route.src);
  const host = new RegExp(route.hostPattern);
  assert.equal(route.projectId,'prj_8AQEDibYCzspPx67Wc0F7EpCFQGY');
  assert.equal(route.status,403);
  assert.equal(route.responseHeaders['Cache-Control'],'no-store');
  assert.ok(host.test(route.hostname));
  for(const other of ['kidbuster.vercel.app','pathfinder-v2-staging-preview.vercel.app',route.hostname+'.evil.test']) assert.ok(!host.test(other));
  assert.ok(!denied.test('/api/krisp-webhook'));
  for(const path of ['/','/index.html','/api/license-status','/api/generate','/api/krisp-session','/api/payment-webhook','/assets/logos/krisp-neutral.png','/api/krisp-webhook/','/api/krisp-webhook.json','/API/krisp-webhook','/api/krisp-webhook/../license-status']) assert.ok(denied.test(path),path);
  console.log('PASS isolated ingress fence permits only the exact webhook path');
  return 0;
};
