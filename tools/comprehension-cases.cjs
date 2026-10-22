'use strict';
// Lesson-comprehension evaluation cases (2026-10-19 brief). FICTIONAL people and
// lessons in RADAR VAN transcript format ("[mm:ss] TEACHER|STUDENT: ..."). Each
// case carries its ground truth so a reviewer or judge can score fidelity:
//   topics       what really happened, with a keyword pattern for coverage
//   theme        the genuine connecting thread, or null when none is defensible
//   commitments  what was explicitly asked/agreed, with the exact scope and the
//                upgrades a report must not invent (pattern = forbidden wording)
//   unsupported  claims a faithful report must not make
// No real student, teacher or customer data. Real transcripts stay in .v2-local.

const lines = rows => rows.map(([t, who, text]) => '[' + t + '] ' + (who === 'T' ? 'TEACHER' : 'STUDENT') + ': ' + text).join('\n');

const CASES = {
  'cmp-philosophical': {
    label: 'Long conversation lesson with a genuine connecting theme (Luka-shaped, fictional)',
    student: 'Marta', teacher: 'Nora', protocols: ['PREPLY'], preplyModule: 'adult',
    transcript: lines([
      ['00:00', 'T', 'Hi Marta, how was your week?'],
      ['00:04', 'S', 'Honestly, quite heavy. We moved my mother into our flat because she cannot live alone anymore after her operation.'],
      ['00:13', 'T', 'That is a big change. How is everyone managing?'],
      ['00:17', 'S', 'My husband is very supportive, but I feel responsible for everything. Cooking, her medicine, the doctors. And I still work full time.'],
      ['00:29', 'T', 'How do you find time for yourself?'],
      ['00:33', 'S', 'This is the problem. I used to paint every Sunday. Now I do not paint at all, and I feel I lost a part of me.'],
      ['00:44', 'T', 'Is there a way to get some of that time back?'],
      ['00:48', 'S', 'I asked my company for a four-day week. If they say yes, Friday will be for my mother and Sunday for painting again.'],
      ['04:10', 'T', 'You mentioned money last time we spoke about the four-day week. Is that a worry?'],
      ['04:16', 'S', 'A little. But for me money is not about buying things. Money is freedom. If I save enough, I can choose my work and not only accept what comes.'],
      ['04:30', 'T', 'So saving is really about having choices.'],
      ['04:33', 'S', 'Exactly. My plan is to save for three more years, then maybe work freelance.'],
      ['09:02', 'T', 'Let us look at one sentence you said earlier. You said, I am working here since five years. How would you say that?'],
      ['09:11', 'S', 'I have been working here for five years.'],
      ['09:14', 'T', 'Perfect. Present perfect continuous, and for with a period of time.'],
      ['09:19', 'S', 'Yes, I always forget this.'],
      ['14:40', 'T', 'You also told me about your friend Ana. How is she?'],
      ['14:45', 'S', 'She is getting better, but it was a shock. She is forty and suddenly she had a serious illness. It made me think a lot.'],
      ['14:56', 'T', 'Think about what?'],
      ['14:58', 'S', 'About time. We always say later, later. After the project, after the children grow up. But later is not guaranteed.'],
      ['15:10', 'S', 'So I booked the trip to Portugal that I postponed for six years. We go in May.'],
      ['15:18', 'T', 'That is a brave decision.'],
      ['15:21', 'S', 'Maybe. I think it is more brave to keep waiting forever.'],
      ['22:30', 'T', 'How is the new position going? You are team lead now, right?'],
      ['22:35', 'S', 'Yes, since September. The team is new for me and some people are older than me. I want them to respect me, but not because I am the boss.'],
      ['22:48', 'T', 'How are you trying to earn that respect?'],
      ['22:51', 'S', 'I listen first. In the first meeting I asked everyone what they need. I think a leader must give people time too, not only tasks.'],
      ['30:05', 'T', 'You said you have to present to the directors next month.'],
      ['30:09', 'S', 'Yes, the quarterly results. In Polish I am fine, but in English I talk too long. When I am nervous I explain everything and the main point gets lost.'],
      ['30:22', 'T', 'Let us try. Give me the main result in two sentences.'],
      ['30:27', 'S', 'Our team reduced delivery time by fifteen percent. Mainly because we changed the order process, and also because the new system, which we started in spring, and the training, which was in March, and'],
      ['30:44', 'T', 'Stop there. Two sentences. Main point first.'],
      ['30:48', 'S', 'We reduced delivery time by fifteen percent. The main reason is the new order process.'],
      ['30:55', 'T', 'Much clearer. That is exactly the shape for the directors.'],
      ['38:12', 'T', 'For next lesson, I would like to do a practice run of the presentation.'],
      ['38:17', 'S', 'Good idea. I am a bit scared.'],
      ['38:20', 'T', 'Could you send me some ideas about what you want to include?'],
      ['38:25', 'S', 'Yes, I can do that.'],
      ['38:28', 'T', 'Great. Then we will build the structure together.'],
      ['38:33', 'S', 'Thank you, Nora. This was a good talk today.']
    ]),
    theme: 'Making time for what matters: caring for family, keeping time for herself (painting), money as freedom, not postponing life after a friend\'s illness, and leading her new team by giving people time.',
    topics: [
      { name: 'moving her mother in / family responsibility', pattern: /mother|caring|care for|family/i },
      { name: 'losing and reclaiming personal time (painting, four-day week)', pattern: /paint|four-day|time for yourself|your own time/i },
      { name: 'money as freedom / saving for choices', pattern: /freedom|saving|choices|freelance/i },
      { name: 'friend\'s illness, not postponing life, Portugal trip', pattern: /later|postpon|portugal|trip|wait/i },
      { name: 'new team lead role and earning respect', pattern: /team|lead|respect/i },
      { name: 'presentation to directors: concise, main point first', pattern: /presentation|director|main point|concise|two sentences/i }
    ],
    commitments: [
      { said: 'Teacher asked Marta to send "some ideas about what you want to include"; no deadline or format.', forbidden: /\boutline\b|\bslides?\b|\bdraft\b|by (monday|tuesday|wednesday|thursday|friday|the weekend)|within (the|a) week|before (our|the) next/i },
      { said: 'Next lesson: a practice run of the presentation.', forbidden: null }
    ],
    unsupported: ['that the four-day week was approved', 'that Marta felt nervous during this lesson (a feeling, not shown)', 'any outline, slides or deadline', 'claims about previous lessons beyond what the teacher said', 'naming the friend\'s illness']
  },

  'cmp-grammar': {
    label: 'Conventional grammar lesson (second conditional), no theme',
    student: 'Tomas', teacher: 'Nora', protocols: ['PREPLY'], preplyModule: 'adult',
    transcript: lines([
      ['00:00', 'T', 'Today we are working on the second conditional. If I had more time, I would learn the guitar. Can you make one?'],
      ['00:09', 'S', 'If I would have more money, I would buy a car.'],
      ['00:14', 'T', 'Close. In the if part we use the past simple. If I had more money.'],
      ['00:19', 'S', 'If I had more money, I would buy a car.'],
      ['00:23', 'T', 'Good. Another one, about your job.'],
      ['00:26', 'S', 'If I was the manager, I would change the schedule.'],
      ['00:31', 'T', 'Fine in conversation. In formal English, if I were the manager.'],
      ['00:36', 'S', 'If I were the manager, I would change the schedule.'],
      ['06:40', 'T', 'Now questions. What would you do if you lost your phone?'],
      ['06:45', 'S', 'If I lost my phone, I will call my operator. No, I would call my operator.'],
      ['06:51', 'T', 'Nice self-correction.'],
      ['12:15', 'T', 'Let us do the gap fill. Number three.'],
      ['12:18', 'S', 'If she studied more, she would pass the exam.'],
      ['12:22', 'T', 'Correct. Number four.'],
      ['12:24', 'S', 'If we lived near the sea, we would go swimming every day.'],
      ['18:30', 'T', 'For homework, please write five sentences with if I were.'],
      ['18:34', 'S', 'Okay, five sentences.'],
      ['18:37', 'T', 'Next time we start the third conditional.']
    ]),
    theme: null,
    topics: [
      { name: 'second conditional form (if + past simple, would)', pattern: /second conditional|if I had|would/i },
      { name: 'if I were (formal)', pattern: /if I were|were/i },
      { name: 'self-correction will -> would', pattern: /self-correct|corrected yourself|caught/i },
      { name: 'third conditional next time', pattern: /third conditional/i }
    ],
    commitments: [
      { said: 'Homework explicitly assigned: write five sentences with "if I were".', forbidden: /ten sentences|a paragraph|an essay|by (monday|tuesday|wednesday|thursday|friday)/i },
      { said: 'Next lesson: third conditional.', forbidden: null }
    ],
    unsupported: ['any personal theme or life philosophy', 'claims that Tomas mastered the conditional independently from the start', 'feelings or confidence described from tone']
  },

  'cmp-short': {
    label: 'Short lesson with limited evidence',
    student: 'Ines', teacher: 'Nora', protocols: ['PREPLY'], preplyModule: 'adult',
    transcript: lines([
      ['00:00', 'T', 'Quick lesson today. Let us practise words for a doctor appointment. What do you say when you arrive?'],
      ['00:07', 'S', 'I have an appointment at ten.'],
      ['00:10', 'T', 'Good. And if you have pain in your back?'],
      ['00:14', 'S', 'My back hurts since two days.'],
      ['00:18', 'T', 'My back has been hurting for two days.'],
      ['00:22', 'S', 'My back has been hurting for two days.'],
      ['00:27', 'T', 'Great. We continue with the pharmacy next time.']
    ]),
    theme: null,
    topics: [
      { name: 'doctor appointment phrases', pattern: /doctor|appointment/i },
      { name: 'has been hurting for (present perfect continuous, with support)', pattern: /been hurting|for two days/i },
      { name: 'pharmacy next time', pattern: /pharmac/i }
    ],
    commitments: [{ said: 'Next time: the pharmacy. No homework was given.', forbidden: /homework|practise at home|write (a|some)/i }],
    unsupported: ['invented activities (role-plays, reading) beyond the few exchanges', 'claims of independence for "has been hurting" (it was repeated after a model)', 'any deep theme']
  },

  'cmp-unrelated': {
    label: 'Conversation across unrelated subjects with no defensible overarching theme',
    student: 'Chen', teacher: 'Nora', protocols: ['PREPLY'], preplyModule: 'adult',
    transcript: lines([
      ['00:00', 'T', 'Hi Chen. Did you watch the match on Saturday?'],
      ['00:04', 'S', 'Yes! My team won two to one. The second goal was in the last minute.'],
      ['00:11', 'T', 'Exciting. Who scored?'],
      ['00:13', 'S', 'The young striker. He is only nineteen.'],
      ['06:20', 'T', 'You said you bought a new phone.'],
      ['06:24', 'S', 'Yes, the camera is very good, but the battery is worse than my old one.'],
      ['06:31', 'T', 'Worse than, good comparative.'],
      ['12:02', 'T', 'What did you cook this week?'],
      ['12:05', 'S', 'Dumplings with my sister. We make the dough, then we fill with pork and cabbage.'],
      ['12:14', 'T', 'Remember, past tense. We made the dough.'],
      ['12:18', 'S', 'We made the dough, then we filled them with pork and cabbage.'],
      ['18:40', 'T', 'And the weather in Taipei?'],
      ['18:43', 'S', 'Very rainy. Typhoon season.'],
      ['24:10', 'T', 'Are you still watching that detective series?'],
      ['24:14', 'S', 'Yes, season two. The ending was surprising, I did not expect the brother was the killer.'],
      ['24:24', 'T', 'Maybe next time you could bring a recipe and explain it to me.'],
      ['24:29', 'S', 'Maybe, if I have time.']
    ]),
    theme: null,
    topics: [
      { name: 'football match', pattern: /match|goal|team|striker/i },
      { name: 'new phone (comparatives)', pattern: /phone|camera|battery|worse/i },
      { name: 'cooking dumplings (past tense)', pattern: /dumpling|cook|dough/i },
      { name: 'weather / typhoon', pattern: /weather|rain|typhoon/i },
      { name: 'detective series', pattern: /series|detective|season/i }
    ],
    commitments: [{ said: 'Teacher suggested bringing a recipe; Chen only said "maybe, if I have time" (not agreed).', forbidden: /(you|chen)( have)? agreed|you('ll| will) bring|you promised|as agreed/i }],
    unsupported: ['an invented overarching theme or life philosophy connecting the topics', 'that Chen agreed to bring a recipe', 'claims about Chen\'s feelings']
  },

  'cmp-fragmented': {
    label: 'Lesson whose student speech degrades into fragments (transcription damage)',
    student: 'Piotr', teacher: 'Nora', protocols: ['PREPLY'], preplyModule: 'adult',
    transcript: lines([
      ['00:00', 'T', 'Last time you said you want to ask for a raise. How are you feeling about it now?'],
      ['00:06', 'S', 'I think I am ready. I have more responsibilities than last year, and I trained two new colleagues.'],
      ['00:15', 'T', 'Those are strong arguments. How would you start the conversation?'],
      ['00:19', 'S', 'I would say, I would like to discuss my salary, because my role has grown.'],
      ['00:26', 'T', 'Very professional.'],
      ['09:30', 'T', 'What if your manager says there is no budget?'],
      ['09:34', 'S', 'Then I ask what I need to do to'],
      ['09:36', 'S', 'raise next'],
      ['09:37', 'S', 'flower the the'],
      ['09:39', 'S', 'review in'],
      ['09:41', 'T', 'Sorry, the connection is breaking. You said something about the review?'],
      ['09:45', 'S', 'six months the'],
      ['09:46', 'S', 'gold'],
      ['15:02', 'S', 'and the bonus maybe'],
      ['15:04', 'S', 'not sure'],
      ['15:10', 'T', 'Next week let us role-play the salary conversation. Think about the number you want to ask for.'],
      ['15:17', 'S', 'okay number']
    ]),
    theme: null,
    topics: [
      { name: 'preparing to ask for a raise (clear arguments: more responsibilities, trained colleagues)', pattern: /raise|salary|responsibilit|trained/i },
      { name: 'professional opening sentence', pattern: /discuss my salary|my role has grown|professional/i },
      { name: 'role-play next week; think about the number', pattern: /role-play|role play|number/i }
    ],
    commitments: [{ said: 'Next week: role-play the salary conversation; Piotr should think about the number to ask for.', forbidden: /write|send|email|research (the )?market|prepare a (list|document)/i }],
    unsupported: ['anything built on the fragments ("flower", "gold", "bonus", "six months review") as Piotr\'s plan or opinion', 'criticising Piotr for unfinished sentences that are transcription damage', 'claims about how the review/bonus discussion went']
  },

  'cmp-child-vocab': {
    label: 'Young learner vocabulary lesson (regression: no worldview analysis)',
    student: 'Ben', teacher: 'Nora', protocols: ['MA', 'OF', 'FAIRY'], preplyModule: 'parent',
    ratings: { numeric: '4', OF: 'Medium/High', BEIDA: 'excellent' }, gender: 'boy',
    transcript: lines([
      ['00:00', 'T', 'Hello Ben! Today we learn fruit. What is this?'],
      ['00:04', 'S', 'Apple!'],
      ['00:06', 'T', 'Yes, an apple. What colour is it?'],
      ['00:09', 'S', 'It is red.'],
      ['00:12', 'T', 'Great sentence. And this one?'],
      ['00:15', 'S', 'Banana. Banana is yellow.'],
      ['00:19', 'T', 'The banana is yellow. Say it with me.'],
      ['00:22', 'S', 'The banana is yellow.'],
      ['03:40', 'T', 'Now the game. Do you like grapes?'],
      ['03:44', 'S', 'Yes, I like grapes. I do not like lemon.'],
      ['03:49', 'T', 'Lemons are sour! Good.'],
      ['06:10', 'T', 'Last one. How many oranges?'],
      ['06:13', 'S', 'Three oranges.'],
      ['06:16', 'T', 'Super. Goodbye Ben!']
    ]),
    theme: null,
    topics: [
      { name: 'fruit names (apple, banana, grapes, lemon, orange)', pattern: /apple|banana|grape|lemon|orange|fruit/i },
      { name: 'colour sentences (It is red / The banana is yellow with support)', pattern: /red|yellow|colou?r/i },
      { name: 'likes and dislikes (I like grapes, I do not like lemon)', pattern: /like/i },
      { name: 'counting (three oranges)', pattern: /three|count/i }
    ],
    commitments: [{ said: 'No homework or next-lesson agreement was made.', forbidden: /(was|were) assigned|as (we )?agreed/i }],
    unsupported: ['any reflective life theme, worldview or philosophy', '"The banana is yellow" as independent (it was repeated after a model)', 'feelings, smiles or excitement']
  }
};

module.exports = { CASES };
