'use strict';
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const c=extractKidbusterCore();
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const opts={rating:'4',lengthFormat:'medium',forcedClassicStyleVariant:'standard',forcedModelKey:'balanced'};
const observed={
 maShort:digest(c.buildMASystemPrompt({...opts,lengthFormat:'short'})),
 maLong:digest(c.buildMASystemPrompt({...opts,lengthFormat:'long'})),
 ms:digest(c.buildSweetSystemPrompt(opts)),
 fairy:digest(c.buildFairySystemPrompt(opts)),
 blitz:digest(c.buildBlitzSystemPrompt(opts)),
 beida:digest(c.buildBeidaSystemPrompt(opts)),
 of:digest(c.buildOFSystemPrompt(opts)),
 preply:digest(c.buildPreplySystemPrompt(opts))
};
// SHA-256 snapshots taken from the release immediately before Classic Medium 2.0.
const baseline={
 maShort:'11ab8943be288a42e604b972a97cbc6104d0c865f020a83ac363164c9bb58831',
 maLong:'9d5a66d0f95be4c31de2d1203b14d7989288c1a1f92cd04c25cb311b35bca244',
 ms:'9e8aa86a36c52f4e82c791ca00dba114d6ac041379ea77280936f5fb53d8e082',
 fairy:'7eb8316aec4262cab4c6d615c9bb9ee9dd27cc21fda638cbc45927a961070298',
 blitz:'24093c014edd51b89867445e28b6de7103dc718fb26fd585d4353b9029c4ef66',
 beida:'42dc4d248735115e726a34692d262114d60a6891f4201d99a1377bb19edba6d7',
 of:'f60e0e1fd2921d5487b49293e20a32a0df71f1c8e96c18d1e9a81af253ce587b',
 preply:'13aacf79dcf48b8a1a1e06faa3865f8eaf8e9daab0f5925fc03f070d1a15c0c6'
};
assert.deepEqual(observed,baseline,'Classic Medium 2.0 must not alter any other protocol or Classic length');
for(const style of ['standard','warm','crisp','coach']){
 const medium=c.buildMASystemPrompt({rating:'4',lengthFormat:'medium',forcedClassicStyleVariant:style});
 const short=c.buildMASystemPrompt({rating:'4',lengthFormat:'short',forcedClassicStyleVariant:style});
 const long=c.buildMASystemPrompt({rating:'4',lengthFormat:'long',forcedClassicStyleVariant:style});
 assert(medium.includes('PRIVATE EVIDENCE-RANKING CHECK BEFORE WRITING'),style+': Medium rubric missing');
 assert(medium.includes('spontaneous student idea') && medium.includes('teacher explanation') && medium.includes('guided attempt'),style+': evidence types missing');
 assert(medium.includes('2–3 consequential student learning moments'),style+': lesson essence rank missing');
 assert(medium.includes('actual lesson') && medium.includes('warmly encouraging'),style+': relevance and warmth missing');
 assert(medium.includes('Grammar & Sentence Practice') && medium.includes("Today's Superpower"),style+': section intelligence missing');
 assert(medium.includes('peripheral proper names are optional'),style+': pronunciation priority missing');
 assert(!medium.includes('Yellowstone') && !medium.includes('Chloe') && !medium.includes('Cyrus'),style+': must generalise');
 assert(!short.includes('PRIVATE EVIDENCE-RANKING') && !long.includes('PRIVATE EVIDENCE-RANKING'),style+': leaked into other lengths');
 assert(!medium.includes('[Positive closing sentence.]'),style+': extra closing instruction revived');
}
console.log('PASS Classic Medium 2.0 evidence rubric and eight unchanged non-target prompt snapshots');
