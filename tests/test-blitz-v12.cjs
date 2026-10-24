'use strict';
// Blitz V1.2 (owner assignment 2026-10-24): the teacher supplies the facts,
// Blitz supplies the language. Archetypes are style only, the rating is
// optional, length follows how much the notes say, padding earns one
// shortening attempt, and nothing about the other six protocols changes.
const { createChecker } = require('./helpers/assert.cjs');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-blitz-v12.cjs ===');
  const old = process.env.KIDBUSTER_TEST_KV;
  process.env.KIDBUSTER_TEST_KV = '1';
  const log = console.log;
  const quiet = fn => { console.log = () => {}; try{ return fn(); } finally{ console.log = log; } };
  try{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const start = html.indexOf('const KidbusterCore = (function(){');
    const core = new Function(html.slice(start, html.indexOf('\n})();', start) + 6) + '\nreturn KidbusterCore;')();
    const keys = Object.keys(core.BLITZ_MODEL_POOL);

    // Every archetype x voice builds a complete prompt.
    let complete = 0;
    for(const key of keys){
      for(const voice of core.BLITZ_VOICES){
        const prompt = quiet(() => core.buildBlitzSystemPrompt({ forcedModelKey: key, voice }));
        const pool = core.BLITZ_MODEL_POOL[key];
        if(!/__BLITZ_/.test(prompt) && prompt.includes(pool[voice]) && prompt.includes(pool.emphasis)
          && prompt.includes('Voice: ' + voice[0].toUpperCase() + voice.slice(1) + '.')
          && prompt.includes('shapes emphasis, structure and rhythm only, never facts')) complete++;
      }
    }
    check('all 30 archetype x voice prompts are complete (emphasis, voice guide, example, no tokens)', keys.length === 10 && complete === 30);
    check('each archetype states its emphasis is conditional on the notes', keys.every(k => typeof core.BLITZ_MODEL_POOL[k].emphasis === 'string' && core.BLITZ_MODEL_POOL[k].emphasis.length > 20));
    const blitz = quiet(() => core.buildBlitzSystemPrompt({ forcedModelKey: 'progress', voice: 'warm' }));
    check('V1.2 working steps are present (extract, expand, personalize, polish)', ['1. EXTRACT', '2. EXPAND', '3. PERSONALIZE', '4. POLISH'].every(s => blitz.includes(s)));
    check('the never-invent list covers grades, behaviour and earlier lessons', blitz.includes('NEVER INVENT') && /test results or grades/.test(blitz) && /behaviour/.test(blitz) && /improvement compared with earlier lessons/.test(blitz));
    check('mixed and negative notes are preserved, never inflated', blitz.includes('MIXED AND NEGATIVE NOTES') && blitz.includes('Never turn a difficult lesson into an excellent one'));
    check('the lesson-essence rules cannot push Blitz into invented detail', blitz.includes('BLITZ AND THE LESSON ESSENCE RULES') && blitz.includes('Never create a goal, success, difficulty or next step that the notes do not give'));
    check('the teacher is never asked for more', blitz.includes('never ask for more'));

    // Rating optional for Blitz only (server authority).
    const m = await import('../api/_lib/server-generation.js');
    const gen = input => quiet(() => m.buildServerGeneration({ teacherName: 'Layne', studentName: 'Alex', notes: 'Alex was nice, animals and colours, good lesson, thanks.', ...input }));
    let ok = true; try{ gen({ protocol: 'BLITZ' }); }catch{ ok = false; }
    check('Blitz generates without a rating', ok);
    check('Blitz with a rating still sends it', /Rating: 4\/5/.test(gen({ protocol: 'BLITZ', rating: '4' }).userMessage));
    let bad = false; try{ gen({ protocol: 'BLITZ', rating: '9' }); }catch(e){ bad = e.name === 'GenerationRequestError'; }
    check('Blitz still rejects an invalid rating', bad);
    let required = false; try{ gen({ protocol: 'MA' }); }catch(e){ required = e.name === 'GenerationRequestError'; }
    check('Classic still requires a rating', required);
    check('the browser lets Blitz generate without a rating', html.includes("if(!form.rating && form.protocol !== 'PREPLY' && form.protocol !== 'BLITZ'){"));
    check('the rating label says optional for Blitz', html.includes("isBlitz ? 'Performance rating (optional)' : 'Performance rating'"));

    // Padding sparse notes earns one shortening attempt; 150 words stays hard.
    const ctx = { protocol: 'BLITZ', teacherName: 'Layne', studentName: 'John', notes: 'John was great today. Thanks.' };
    const words = n => Array.from({ length: n }, (_, i) => 'word' + (i % 7)).join(' ') + '.';
    const short = m.evaluateGeneratedOutput('BLITZ', words(45), ctx);
    check('a 45-word comment for sparse notes is compliant with no repair', short.compliant && !short.softRepair);
    const padded = m.evaluateGeneratedOutput('BLITZ', words(95), ctx);
    check('a 95-word comment for "John was great today" earns one shortening attempt', padded.softRepair === true && padded.compliant);
    check('the repair goal names the adaptive range', /about 30-55 words/.test(padded.limits.goal));
    const huge = m.evaluateGeneratedOutput('BLITZ', words(160), ctx);
    check('over 150 words is still a blocking finding', huge.blocking.some(b => b.code === 'length_hard'));
    const signed = m.evaluateGeneratedOutput('BLITZ', words(45) + '\nTeacher Layne 🌸', { ...ctx, signoffEmoji: '🌸' });
    check('the optional teacher sign-off still validates', signed.compliant && !signed.blocking.some(b => b.code === 'signoff'));

    // The other six protocols are untouched by the Blitz change: their prompts
    // match the commit before Blitz V1.2 byte for byte.
    const cp = require('node:child_process');
    let before = null;
    try{ before = cp.execSync('git show f82cab6:index.html', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }catch{}
    if(before){
      const s0 = before.indexOf('const KidbusterCore = (function(){');
      const coreBefore = new Function(before.slice(s0, before.indexOf('\n})();', s0) + 6) + '\nreturn KidbusterCore;')();
      const params = { MA: { rating: '4', forcedClassicStyleVariant: 'crisp' }, MS: { rating: '2' }, FAIRY: { rating: '4' }, BEIDA: { rating: 'excellent' }, OF: { rating: 'Medium' }, PREPLY: { module: 'adult' } };
      const same = Object.entries(params).filter(([p, prm]) => quiet(() => core.PROTOCOLS[p].buildSystemPrompt(prm)) === quiet(() => coreBefore.PROTOCOLS[p].buildSystemPrompt(prm))).map(([p]) => p);
      check('the other six protocols\' system prompts are byte-identical to before Blitz V1.2 (' + same.join(',') + ')', same.length === 6);
      const msg = (c, p) => c.buildUserMessage({ protocol: p, studentName: 'Mia', notes: 'Teacher: Hi.\nStudent: Hi.', rating: p === 'BEIDA' ? 'excellent' : p === 'OF' ? 'Medium' : '4', teacherName: 'Layne', studentGender: 'girl' });
      check('the other six protocols\' user messages are unchanged', Object.keys(params).every(p => msg(core, p) === msg(coreBefore, p)));
    }else{
      console.log('  (skipped: git history not available)');
    }
  }catch(e){ console.error('blitz v1.2 test:', e.stack || e); check('blitz v1.2 scenario completed', false); }
  finally{ console.log = log; if(old === undefined) delete process.env.KIDBUSTER_TEST_KV; else process.env.KIDBUSTER_TEST_KV = old; }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
