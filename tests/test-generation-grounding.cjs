'use strict';
// Prompt-side grounding repair (2026-10-15 live audit). Deterministic checks of
// the trusted prompts the server builds; they prove instructions exist and
// identities are preserved, NOT that a model will obey them.
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-generation-grounding.cjs ===');
  const core=extractKidbusterCore();
  const {buildServerGeneration}=await import('../api/_lib/server-generation.js');
  const base={teacherName:'Nora',studentName:'Mia',notes:'Fictional lesson: Mia repeated "I can run" after the teacher modeled it.',remarks:'',lengthFormat:'medium',studentGender:'girl',signoffEmoji:'',blitzVoice:'warm',preplyModule:'parent',preplyTrialPerson:'child'};
  const settings={MA:{rating:'3'},MS:{rating:'3'},FAIRY:{rating:'3'},BLITZ:{rating:'3'},BEIDA:{rating:'try_harder'},OF:{rating:'Medium'},PREPLY:{rating:''}};
  const prompts={};
  for(const [protocol,extra] of Object.entries(settings))prompts[protocol]=buildServerGeneration({...base,protocol,...extra}).systemPrompt;

  console.log('\n1) every protocol carries the shared evidence grounding rules');
  const rules=core.EVIDENCE_GROUNDING_RULES;
  for(const [protocol,prompt] of Object.entries(prompts)){
    check(protocol+': grounding rules embedded verbatim',prompt.includes(rules));
  }
  for(const [label,needle] of [
    ['no previous-lesson history','Never mention previous lessons'],
    ['support is not independence','Support is not independence'],
    ['no pronunciation diagnosis from transcript spelling','A transcript records words, not sounds'],
    ['transcription noise is not student error','usually transcription errors'],
    ['teacher suggestions are not achievements','not student accomplishments'],
    ['homework is a recommendation, not assigned','Never state they were assigned'],
    ['no guaranteed outcomes','Never promise or guarantee results'],
    ['nonstandard teacher phrasing never modeled','Model correct, standard English'],
    ['settings authoritative without invented events','never invent lesson events to justify them'],
    ['say less when uncertain','say less']
  ])check('rule present: '+label,rules.includes(needle));
  check('grounding sits in the cacheable static part (before the runtime divider)',(()=>{
    const p=prompts.MA,idx=p.lastIndexOf('\n\n────────────────────────────────────────\n\n');return p.indexOf('EVIDENCE GROUNDING RULES')<idx;})());

  console.log('\n2) versions are bumped, never silently edited in place');
  check('Classic is MA V2.10',prompts.MA.startsWith('MA PROTOCOL COMMAND CHAIN V2.10'));
  check('Sugarcoat is Sweet Voice V1.1',prompts.MS.startsWith('SWEET VOICE PROTOCOL COMMAND CHAIN V1.1'));
  check('OF is V1.5',prompts.OF.startsWith('OF PROTOCOL COMMAND CHAIN V1.5'));
  check('Blitz is V1.1',prompts.BLITZ.startsWith('BLITZ PROTOCOL COMMAND CHAIN V1.1'));
  check('Beida is V1.1',prompts.BEIDA.startsWith('BEIDA PROTOCOL COMMAND CHAIN V1.1'));
  check('Preply is V1.1',prompts.PREPLY.startsWith('PREPLY PROTOCOL COMMAND CHAIN V1.1'));

  console.log('\n3) mode-specific corrections');
  check('Classic: vocabulary Notes may not claim "said it clearly"',prompts.MA.includes('Never write "said it clearly"'));
  check('Classic: Pronunciation Focus gives model pronunciation, not a diagnosis',prompts.MA.includes('never a description of how the student said it wrong'));
  check('Sugarcoat: template now contains the Superpower section',/Today's Superpower:\n🦸 \[Listening/.test(prompts.MS));
  check('Sugarcoat: Superpower is declared mandatory',prompts.MS.includes("Today's Superpower is mandatory"));
  check('Sugarcoat: warmth may not invent lesson history',prompts.MS.includes('never from invented ones'));
  for(const [tier,limit] of [['short',2400],['medium',3000],['long',4800]]){
    const p=buildServerGeneration({...base,protocol:'FAIRY',rating:'3',lengthFormat:tier}).systemPrompt;
    check('Fairy '+tier+': prompt states the '+limit+'-character ceiling the validator enforces',p.includes('must stay under '+limit+' characters'));
  }
  check('Fairy: medium trim rule caps vocabulary and grammar',prompts.FAIRY.includes('at most 8 vocabulary items')&&prompts.FAIRY.includes('at most 3 grammar points'));
  check('Fairy: Positive Feedback slot no longer suggests pronunciation praise',!prompts.FAIRY.includes('e.g. clear pronunciation'));
  for(const [rating,omit] of [['1',true],['2.5',true],['3',false],['6',false]]){
    const p=buildServerGeneration({...base,protocol:'FAIRY',rating}).systemPrompt;
    check('Fairy rating '+rating+': prompt states the star rule the validator enforces ('+(omit?'omit':'10 stars')+')',omit?p.includes('OMIT the entire "Total stars today" line'):p.includes('include "Total stars today:" with exactly 10 stars'));
  }
  check('Fairy: imagination limited to voice, not facts',prompts.FAIRY.includes('Imagination belongs in the storytelling voice'));
  check('OF: 300 words is a ceiling, not a target',prompts.OF.includes('300 is a ceiling, not a target'));
  check('OF: evaluation precision guidance',prompts.OF.includes('Evaluate at the level the evidence shows'));
  check('OF: selected pronoun still supplied as a fact',buildServerGeneration({...base,protocol:'OF',rating:'Medium'}).userMessage.includes('she/her/her'));
  check('Preply: tutor writes in the first person',prompts.PREPLY.includes('VOICE RULE')&&prompts.PREPLY.includes('Never refer to yourself by name'));
  check('Preply parent: 150 words is the maximum, not a target',prompts.PREPLY.includes('150 is the maximum'));
  for(const module of ['adult','trial']){
    const p=buildServerGeneration({...base,protocol:'PREPLY',rating:'',preplyModule:module}).systemPrompt;
    check('Preply '+module+': voice rule applies to every module',p.includes('VOICE RULE'));
  }
  check('Beida: two-field output format unchanged',prompts.BEIDA.includes('LEARNING CONTENT:')&&prompts.BEIDA.includes('GENERAL AND DETAILED PERFORMANCE:'));

  console.log('\n4) protocol personalities remain distinguishable');
  check('Classic keeps its professional "Cheers," sign-off',/Cheers,\nTeacher Nora/.test(prompts.MA));
  check('Sugarcoat keeps "Love, ... 💖" and its loving narration',prompts.MS.includes('Love, Teacher Nora 💖')&&prompts.MS.includes('endless patience, kindness, and genuine joy'));
  check('Fairy keeps child-friendly narration and "Love, Teacher"',prompts.FAIRY.includes('child-friendly narration')&&prompts.FAIRY.includes('Love, Teacher [Name]'));
  check('Blitz keeps its 70-120 word, no-emoji identity',prompts.BLITZ.includes('Length target: 70-120 words')&&prompts.BLITZ.includes('Never use emojis'));
  check('OF keeps third-person trial narrative for adults',prompts.OF.includes('Write about the student in the third person'));
  check('Preply keeps relationship-building philosophy',prompts.PREPLY.includes('Classic documents lessons. Preply builds relationships.'));
  const distinct=new Set(Object.values(prompts).map(p=>p.slice(0,40)));
  check('seven distinct protocol prompts (no shared generic template)',distinct.size===7);
  for(const voice of ['simple','polished']){
    const p=buildServerGeneration({...base,protocol:'BLITZ',rating:'3',blitzVoice:voice}).systemPrompt;
    check('Blitz '+voice+' voice still builds with grounding',p.includes(rules));
  }
  for(const rating of ['1','2.5','6']){
    const p=buildServerGeneration({...base,protocol:'MA',rating}).systemPrompt;
    check('Classic rating '+rating+' builds with grounding and its own tone line',p.includes(rules)&&p.includes('Selected rating: '+rating+'/5'));
  }

  return getFailures();
};

if(require.main===module)module.exports().then(f=>process.exit(f?1:0));
