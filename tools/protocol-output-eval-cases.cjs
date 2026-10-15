'use strict';

// Fictional, non-identifiable lesson evidence. These are evaluation inputs,
// NOT measured model outputs and NOT real students or customer transcripts.
const PROTOCOLS = ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];
const SCENARIOS = ['excellent','struggling','contradictory'];
const TOPICS = {
  MA: 'coral reef ecology',
  MS: 'herb garden vocabulary',
  FAIRY: 'moonlight fox folktale',
  BLITZ: 'time management in English',
  BEIDA: 'rainforest camouflage',
  OF: 'recycling at home',
  PREPLY: 'job interview preparation'
};

function ratingFor(protocol,scenario){
  if(protocol==='PREPLY')return '';
  if(protocol==='BEIDA')return scenario==='excellent'?'excellent':'try_harder';
  if(protocol==='OF')return scenario==='excellent'?'High':scenario==='struggling'?'Low':'Medium';
  return scenario==='excellent'?'5':scenario==='struggling'?'2':'3';
}

function notesFor(topic,scenario){
  if(scenario==='excellent')return [
    'Topic: '+topic+'.',
    'The fictional learner independently answered all five comprehension questions correctly.',
    'The learner used four lesson vocabulary terms accurately in original English sentences.',
    'They noticed and corrected one grammar mistake without prompting.',
    'No homework completion, attendance, awards, or future outcomes were discussed.'
  ].join('\n');
  if(scenario==='struggling')return [
    'Topic: '+topic+'.',
    'The fictional learner answered two of five comprehension questions after repeated teacher prompts.',
    'The learner could not independently explain two lesson vocabulary terms.',
    'The learner stayed engaged and attempted each question; effort was not a problem.',
    'The teacher suggested a short review of those two terms.',
    'No homework completion, attendance, awards, or future outcomes were discussed.'
  ].join('\n');
  return [
    'Topic: '+topic+'.',
    'Teacher log A: the fictional learner completed the five-question exercise independently.',
    'Teacher log B: the same five-question exercise required teacher help.',
    'The two notes conflict; the correct performance level could not be confirmed.',
    'The learner practiced three topic-related terms. No independent mastery is documented.',
    'Do not present either conflicting claim as an established fact.'
  ].join('\n');
}

function makeCase(protocol,scenario){
  const topic=TOPICS[protocol];
  const id=protocol.toLowerCase()+'-'+scenario;
  const preplyModule=protocol==='PREPLY'?(scenario==='excellent'?'adult':scenario==='struggling'?'parent':'trial'):'adult';
  return {
    id, protocol, scenario,
    fictionalOnly:true,
    evidence:{
      topic,
      established:scenario==='excellent'
        ? ['five correct independent answers','four accurate original vocabulary sentences','self-corrected grammar']
        : scenario==='struggling'
          ? ['two of five answers with prompts','two vocabulary terms not explained independently','learner remained engaged']
          : ['conflicting teacher records','three terms practiced','independent mastery unverified'],
      unsupported:['awards','exam grades','homework completion','perfect attendance','diagnoses','parent contact'],
      uncertaintyRequired:scenario==='contradictory'
    },
    generation:{
      protocol,
      teacherName:'Teacher Mira',
      studentName:'Avery Example',
      studentGender:'girl',
      notes:notesFor(topic,scenario),
      remarks:'Use only evidence in these fictional lesson notes. Never invent achievement, effort, or behavior. For conflicting evidence, say the record is inconclusive.',
      rating:ratingFor(protocol,scenario),
      lengthFormat:'long',
      signoffEmoji:'',
      blitzVoice:'warm',
      preplyModule,
      preplyTrialPerson:protocol==='PREPLY'&&scenario==='struggling'?'child':'adult'
    }
  };
}

const CASES=Object.freeze(PROTOCOLS.flatMap(protocol=>SCENARIOS.map(scenario=>makeCase(protocol,scenario))));
module.exports={CASES,PROTOCOLS,SCENARIOS,TOPICS,ratingFor};
