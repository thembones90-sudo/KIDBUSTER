'use strict';
const assert = require('node:assert/strict');
module.exports = async function(){
  const {krispWebhookUrlForToken} = await import('../api/_lib/krisp-webhook-url.js');
  const previous = process.env.VERCEL_ENV;
  try{
    process.env.VERCEL_ENV = 'preview';
    const url = new URL(krispWebhookUrlForToken('synthetic+test/token'));
    assert.equal(url.origin,'https://pathfinder-v2-staging-preview.vercel.app');
    assert.equal(url.pathname,'/api/krisp-webhook');
    assert.equal(url.searchParams.get('token'),'synthetic+test/token');
    process.env.VERCEL_ENV = 'production';
    assert.equal(new URL(krispWebhookUrlForToken('synthetic')).origin,'https://kidbuster.vercel.app');
    console.log('PASS preview links stay in V2; token encoding and existing non-preview behavior preserved');
    return 0;
  }finally{
    if(previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
};
