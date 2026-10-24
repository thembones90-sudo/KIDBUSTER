'use strict';
// Fictional, contract-compliant reports for every protocol. Provider mocks use
// these so generate.js's server-side output contract sees realistic output
// instead of placeholder strings. Every builder is verified against the real
// contract in tests/test-output-contract.cjs, so a fixture cannot silently
// drift out of compliance.

const STARS = '⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐';

function maFamily({ student, teacher, signoff, emoji, rating, extraVocab = 0 }){
  const lowRating = ['1','1.5','2','2.5'].includes(String(rating));
  const vocab = ['Ocean 🌊 – a very big sea | Pronunciation: OH-shun | Note: used it in a sentence',
    'Fish 🐟 – an animal that swims | Pronunciation: FISH | Note: named it with support',
    'Swim 🏊 – move through water | Pronunciation: SWIM | Note: practiced it in a sentence'];
  for(let i = 0; i < extraVocab; i++) vocab.push('Reef' + i + ' 🪸 – a home for sea animals with many colours and shapes | Pronunciation: REEF | Note: practiced it several times with my help today in class');
  return [
    'Hi ' + student + '!', '',
    'Today we read a short story about the ocean and practiced new animal words.', '',
    "Today's Lesson:", '📚 Ocean Animals', '',
    'Key Vocabulary with Pronunciation & Notes:', '', ...vocab, '',
    'Grammar & Sentence Practice:', '', '"The fish can swim."', '"I can see the ocean."', '',
    'Grammar Points We Covered:', '', '1. Can + verb for ability', '   👉 The fish can swim.', '   👉 I can see a shark.', '',
    "Today's Superpower:", '🦸 Speaking', '',
    'You answered each ocean question with a full sentence after I gave one example, and you kept trying.', '',
    ...(lowRating ? ['Parent Note:', 'Short daily practice of the three ocean words at home would help.', ''] : []),
    'Mini Homework:', '', 'Speaking Mission 🎯', 'Say three sentences about ocean animals.', '',
    ...(lowRating ? [] : ['Total Stars Today:', '', STARS, '']),
    ...(signoff === 'Cheers,' ? [] : ['See you next time!', '']),
    signoff + '\nTeacher ' + teacher + (emoji ? ' ' + emoji : '')
  ].join('\n');
}

function validReport(protocol, opts = {}){
  const student = opts.student || 'Test Student';
  const teacher = opts.teacher || 'Layne';
  const rating = opts.rating || (protocol === 'BEIDA' ? 'excellent' : protocol === 'OF' ? 'Medium' : '4');
  switch(protocol){
    case 'MA': return maFamily({ student, teacher, signoff:'Cheers,', emoji: teacher === 'Layne' ? '🐺' : '', rating, extraVocab: opts.extraVocab || 0 });
    case 'MS': {
      const base = maFamily({ student, teacher, signoff:'Love,', emoji:'💖', rating, extraVocab: opts.extraVocab || 0 });
      return opts.omitSuperpower ? base.replace(/Today's Superpower:\n🦸 Speaking\n\n[^\n]+\n\n/, '') : base;
    }
    case 'FAIRY': {
      const vocab = ['Moon 🌙 – the bright light in the night sky | Pronunciation: MOON | Note: used it in a sentence with help'];
      for(let i = 0; i < (opts.extraVocab || 0); i++) vocab.push('Lantern' + i + ' 🏮 – a small lamp you carry at night through the forest | Pronunciation: LAN-tern | Note: you repeated this word after me and then pointed to the picture in our story, which was lovely to see.');
      return [
        'Hi ' + student + '!', 'Today we followed a little fox through a moonlit story and learned new night words.',
        'Key Vocabulary with Pronunciation & Notes:', '', ...vocab, '',
        'Grammar & Sentence Practice:', '', '"The fox can run fast."', '',
        'Grammar Points We Covered', 'Can + verb – we use it for ability', '👉 The fox can run. The owl can fly.', '',
        'Positive Feedback: You told me what the fox can do in a full sentence after one example. 👍👏', '',
        'Mini Homework: Say two sentences about animals at night.',
        'Total stars today: ' + STARS,
        'Goodnight and see you soon!', '',
        'Love, Teacher ' + teacher
      ].join('\n');
    }
    case 'BLITZ': {
      const words = 'Today ' + student + ' practiced ocean animal words and short sentences with can. ' +
        student + ' stayed engaged and answered each question after a model sentence. ' +
        'A clear strength was naming the animals in the pictures quickly and willingly. ' +
        'Building full sentences without a model is the next area to practice in our upcoming lessons together. ' +
        'Thank you for a focused and positive lesson today, and well done for staying with every activity.';
      return opts.overlong ? (words + ' ').repeat(3).trim() : words;
    }
    case 'BEIDA': return [
      'LEARNING CONTENT:',
      'Hi ' + student + ', teacher ' + teacher + ' here! Today we explored ocean animals together and practiced the words ocean, fish, swim and shark in short sentences such as "The fish can swim." We also looked at pictures of a reef and talked about which animals live there.',
      '',
      'GENERAL AND DETAILED PERFORMANCE:',
      student + ' joined in with every activity and named the ocean animals in the pictures with growing confidence. ' + student + ' built short "can" sentences after hearing a model and repeated new words willingly. More practice saying full sentences without a model would help. Well done, ' + student + '! 🌊'
    ].join('\n');
    case 'OF': {
      const strengths = student + ' joined the trial lesson warmly and answered greetings naturally. He named the animals in the pictures and repeated new words such as ocean, fish and swim after a model. With a sentence to follow, he built short sentences like "The fish can swim" and stayed engaged through every activity. He listened carefully to instructions and tried each new task without hesitation, even when the words were new to him. He also smiled and responded when praised, which helped the lesson move along at a comfortable pace.';
      const areas = 'He would benefit from more practice building full sentences without a model to copy. He could continue developing past tense forms, which needed reminders during the lesson. Answering in longer phrases rather than single words is another useful next step for him.';
      const suggestions = 'Future lessons could keep using topics he enjoys, such as animals, while gradually asking him to produce sentences on his own. Short speaking turns with a clear model, followed by the same question without one, would build his independence step by step.';
      return ['Strengths', '', strengths, '', 'Areas for Improvement', '', areas, '', 'Learning Suggestions', '', suggestions, '', 'Cheers,', 'Teacher ' + teacher].join('\n');
    }
    case 'PREPLY': {
      const text = 'Today ' + student + ' and I worked on ocean animal words and short sentences with "can". ' +
        student + ' named every animal in our pictures and built sentences such as "The fish can swim" after I gave one example. ' +
        'What stood out most was how willingly ' + student + ' kept trying when a sentence did not come out right the first time, and each second attempt was clearer. ' +
        'At home, it would help to ask ' + student + ' what different animals can do and to listen for a full sentence in reply. ' +
        'Next time I would like to build on this by asking for sentences without a model first.';
      return opts.overlong ? text + ' ' + text : text;
    }
    default: throw new Error('Unknown protocol ' + protocol);
  }
}

// Infers which report a mocked provider call should return from the request
// body the server actually built (protocol marker in the system prompt, the
// student and teacher facts in the user message).
function protocolFromSystem(system){
  if(system.includes('SWEET VOICE PROTOCOL')) return 'MS';
  if(system.includes('BLITZ PROTOCOL')) return 'BLITZ';
  if(system.includes('BEIDA PROTOCOL')) return 'BEIDA';
  if(system.includes('OF PROTOCOL')) return 'OF';
  if(system.includes('PREPLY PROTOCOL')) return 'PREPLY';
  if(/MA PROTOCOL COMMAND CHAIN V\d/.test(system)) return 'MA';
  return 'FAIRY';
}
function validReportForProviderBody(rawBody, opts = {}){
  const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  const system = (body.system || []).map(b => b.text).join('');
  const user = String(body.messages?.[0]?.content || '');
  const student = (user.match(/^Student: (.+)$/m) || [])[1] || 'Test Student';
  const rating = (user.match(/^Rating: ([\d.]+)\/5$/m) || [])[1];
  return validReport(protocolFromSystem(system), { student, rating, ...opts });
}

module.exports = { validReport, validReportForProviderBody, protocolFromSystem };
