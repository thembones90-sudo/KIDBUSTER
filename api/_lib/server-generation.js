// Server authority for report construction. The protocol engine remains the
// single pure KidbusterCore block in index.html; this loader evaluates that
// trusted deployment artifact server-side so browser callers can submit only
// lesson facts and selections, never arbitrary system instructions.
import {readFileSync} from 'node:fs';

const START='const KidbusterCore = (function(){';
const END='\n})();';
let cachedCore=null;
let simulateCoreFailure=false;

// Raised ONLY for problems in the teacher's/browser's request. Anything else
// thrown while building a generation is a server fault and must not be
// reported to the teacher as an invalid request.
export class GenerationRequestError extends Error{
  constructor(message){super(message);this.name='GenerationRequestError';}
}

function core(){
  if(simulateCoreFailure)throw new Error('Trusted protocol core is unavailable (simulated)');
  if(cachedCore)return cachedCore;
  const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const start=html.indexOf(START);
  const end=html.indexOf(END,start);
  if(start<0||end<0)throw new Error('Trusted protocol core is unavailable');
  const code=html.slice(start,end+END.length);
  cachedCore=new Function(code+'\nreturn KidbusterCore;')();
  if(!cachedCore?.PROTOCOLS)throw new Error('Trusted protocol core is invalid');
  return cachedCore;
}

function text(value,max,label,required=false){
  if(value===undefined||value===null)value='';
  if(typeof value!=='string')throw new GenerationRequestError(label+' must be text');
  const clean=value.trim();
  if(required&&!clean)throw new GenerationRequestError(label+' is required');
  if(clean.length>max)throw new GenerationRequestError(label+' is too long');
  return clean;
}

export function buildServerGeneration(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new GenerationRequestError('generation must be an object');
  const c=core();
  const protocol=text(input.protocol,20,'protocol',true).toUpperCase();
  const definition=c.PROTOCOLS[protocol];
  if(!definition)throw new GenerationRequestError('Unsupported protocol');
  const form={
    protocol,
    teacherName:text(input.teacherName,80,'teacherName')||'Layne',
    studentName:text(input.studentName,120,'studentName',true),
    notes:text(input.notes,100000,'notes',true),
    remarks:text(input.remarks,5000,'remarks'),
    rating:text(input.rating,30,'rating',protocol!=='PREPLY'),
    lengthFormat:text(input.lengthFormat,20,'lengthFormat')||'long',
    studentGender:text(input.studentGender,10,'studentGender'),
    signoffEmoji:text(input.signoffEmoji,8,'signoffEmoji'),
    blitzVoice:text(input.blitzVoice,20,'blitzVoice')||'warm',
    preplyModule:text(input.preplyModule,20,'preplyModule')||'adult',
    preplyTrialPerson:text(input.preplyTrialPerson,20,'preplyTrialPerson')||'adult'
  };
  const allowedRatings=protocol==='OF'?c.OF_TIERS
    :protocol==='BEIDA'?Object.keys(c.BEIDA_RATING_TIERS)
    :protocol==='PREPLY'?['']
    :c.LEVELS;
  // An optional signature is a short emoji choice, never a second free-text prompt.
  // This also blocks direct API callers from injecting instructions through it.
  if(form.signoffEmoji&&!/^[\p{Extended_Pictographic}\p{Emoji_Component} ]+$/u.test(form.signoffEmoji)){
    throw new GenerationRequestError('signoffEmoji must contain emoji only');
  }
  if(!allowedRatings.includes(form.rating))throw new GenerationRequestError('Unsupported rating for protocol');
  if(!Object.hasOwn(c.LENGTH_TIERS,form.lengthFormat))throw new GenerationRequestError('Unsupported lengthFormat');
  if(!c.BLITZ_VOICES.includes(form.blitzVoice))throw new GenerationRequestError('Unsupported blitzVoice');
  if(!Object.hasOwn(c.PREPLY_MODULES,form.preplyModule))throw new GenerationRequestError('Unsupported preplyModule');
  if(!['adult','child'].includes(form.preplyTrialPerson))throw new GenerationRequestError('Unsupported preplyTrialPerson');
  if(protocol==='OF'&&!['boy','girl'].includes(form.studentGender.toLowerCase())){
    throw new GenerationRequestError('OF requires a valid studentGender');
  }
  // Clean mechanical noise, then label Krisp speakers Teacher/Student and mark
  // likely turn splits (no-op for notes that are not in Krisp format).
  const cleanedNotes=c.normalizeSpeakerTranscript(c.cleanTranscript(form.notes),{teacherName:form.teacherName,studentName:form.studentName});
  if(!cleanedNotes)throw new GenerationRequestError('notes are empty after cleaning');
  let systemPrompt=c.applyTeacherIdentity(definition.buildSystemPrompt({
    rating:form.rating,lengthFormat:form.lengthFormat,voice:form.blitzVoice,module:form.preplyModule
  }),form.teacherName);
  systemPrompt=protocol==='MA'
    ? c.applyMASignoffEmoji(systemPrompt,form.teacherName,form.signoffEmoji)
    : c.applyProtocolSignoffEmoji(systemPrompt,form.teacherName,protocol,form.signoffEmoji);
  const userMessage=c.buildUserMessage({...form,notes:cleanedNotes});
  return {protocol,systemPrompt,userMessage,form};
}

// Final-output contract for a generated report, judged by the same trusted
// core (and therefore the same validators the browser shows). Structural
// compliance only: contentReviewed is always false.
export function evaluateGeneratedOutput(protocol,text,form){
  return core().evaluateOutputContract(protocol,text,{
    rating:form.rating,teacherName:form.teacherName,lengthFormat:form.lengthFormat,
    studentGender:(form.studentGender||'').toLowerCase(),signoffEmoji:form.signoffEmoji,
    preplyModule:form.preplyModule,studentName:form.studentName,preplyTrialPerson:form.preplyTrialPerson
  });
}

// The repair never sees the transcript, but it must keep the per-report facts
// (name, teacher, pronoun, rating, module): everything in the user message
// before the lesson evidence.
export function repairFacts(form){
  const msg=core().buildUserMessage({...form,notes:''});
  const cut=msg.search(/\n(Krisp notes|Lesson evidence)/);
  return cut>=0?msg.slice(0,cut):msg;
}
export function buildRepairMessage(protocol,draft,contract,form){
  return core().buildComplianceRepairPrompt(protocol,draft,contract,form?repairFacts(form):'');
}

export function __resetServerGenerationForTests(){cachedCore=null;}
export function __simulateCoreFailureForTests(value){simulateCoreFailure=!!value;cachedCore=null;}
