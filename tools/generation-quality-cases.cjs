'use strict';
// Fictional, anonymized lesson transcripts for the 2026-10-15 generation
// quality repair regression. NOT real students, teachers or lessons. Each case
// carries a fact sheet so a reviewer can check generated claims against what
// the evidence does and does not support. Deterministic checks cannot judge
// these facts; they exist for human (teacher) review.

const CASES = {
  strong_independent: {
    label: 'Strong independent performance',
    student: 'Sam', teacher: 'Nora',
    ratings: { numeric: '5', BEIDA: 'excellent', OF: 'High' },
    transcript: `Nora | 00:00
Hi Sam! Today we're talking about weather. What's the weather like where you are?
Sam | 00:06
It's raining today and it's very windy. Yesterday it was sunny.
Nora | 00:12
Great sentence. Can you tell me what you wear when it rains?
Sam | 00:16
I wear my raincoat and my boots, and I take an umbrella.
Nora | 00:22
Perfect. Let's read this short text about seasons. Read the first part.
Sam | 00:27
"In winter it is cold and snowy. In summer it is hot." Winter is my favourite season because I like snow.
Nora | 00:40
Wonderful, you gave a reason. Now, five questions. Number one: Which season is hot?
Sam | 00:45
Summer is hot.
Nora | 00:47
Number two: What do you need when it's cold?
Sam | 00:50
You need a coat and gloves. Sorry, I need a coat and gloves.
Nora | 00:55
Nice self-correction. Number three: What happens in autumn?
Sam | 00:59
The leaves fall from the trees and it is cooler.
Nora | 01:05
Excellent. Numbers four and five you answered in writing, all correct. Now make your own sentence with "foggy".
Sam | 01:12
When it's foggy, I can't see the bus stop from my window.
Nora | 01:18
That's a great original sentence. Well done today, Sam. Ten stars!`,
    supported: ['weather and seasons vocabulary (raining, windy, sunny, snowy, foggy, raincoat, umbrella)', 'answered all five questions correctly', 'self-corrected "you need" to "I need" without help', 'produced original sentences independently (foggy sentence, reason for favourite season)', 'read a short text aloud'],
    unsupported: ['any previous lesson or homework', 'pronunciation problems', 'difficulty or needing support', 'specific grammar rule taught explicitly']
  },
  heavy_scaffolding: {
    label: 'Significant difficulty with extensive teacher support',
    student: 'Ava', teacher: 'Nora',
    ratings: { numeric: '2', BEIDA: 'try_harder', OF: 'Low' },
    transcript: `Nora | 00:00
Hello Ava! Today we learn food words. What is this?
Ava | 00:05
Um.
Nora | 00:06
It's an apple. Say "It's an apple."
Ava | 00:09
Apple.
Nora | 00:10
It's an apple.
Ava | 00:12
It's apple.
Nora | 00:14
It's AN apple. Good try. What's this? It's a ba...
Ava | 00:19
Banana.
Nora | 00:20
Yes! It's a banana. Do you like bananas? Say "I like bananas."
Ava | 00:26
I like.
Nora | 00:27
I like bananas.
Ava | 00:29
I like bananas.
Nora | 00:31
Great. What's this one? Bread. Say bread.
Ava | 00:35
I don't know.
Nora | 00:37
It's bread. Bread.
Ava | 00:39
Bread.
Nora | 00:41
Now you choose. Do you like milk or juice? I like...
Ava | 00:46
Juice.
Nora | 00:47
I like juice.
Ava | 00:49
I like juice.
Nora | 00:51
Very good. Let's play the matching game. Find the apple. Point to it.
Ava | 00:57
This?
Nora | 00:58
That's the banana. The apple is red. Try again.
Ava | 01:02
This.
Nora | 01:03
Yes, that's the apple. We will practise these words again. Bye Ava!`,
    supported: ['food words apple, banana, bread, milk, juice', 'repeated sentences after the teacher modeled them', 'needed many prompts; said "I don\'t know" once', 'chose juice and repeated "I like juice" with a model', 'matched apple on the second try after a hint', 'missed the article "an"'],
    unsupported: ['producing sentences independently', 'mastery of the food words', 'behaviour or effort problems', 'any previous lesson', 'homework assigned']
  },
  noisy_transcript: {
    label: 'Noisy or ambiguous speech-to-text',
    student: 'Kai', teacher: 'Nora',
    ratings: { numeric: '3', BEIDA: 'try_harder', OF: 'Medium' },
    transcript: `Nora | 00:00
Was ist das. Hello hello, Kai.
Kai | 00:04
Hello teacher.
Nora | 00:06
Today, animals. What animal is this? It's a...
Kai | 00:10
It's a elephant big.
Nora | 00:13
An elephant. It's a big elephant.
Kai | 00:16
It's a big elephant.
Nora | 00:18
Good. And this one?
Kai | 00:20
Giraffe. Giraffe long neck. I want pizza.
Nora | 00:25
Ha. The giraffe has a long. Neck.
Kai | 00:29
The giraffe has a long.
Nora | 00:31
Neck. Good. Can a giraffe swim?
Kai | 00:34
No swim. It can no.
Nora | 00:37
It can't swim. Say "It can't swim."
Kai | 00:40
It can't swing.
Nora | 00:42
Swim. Swim. It can't swim.
Kai | 00:45
It can't swim.
Nora | 00:47
Monkey. What can a monkey do?
Kai | 00:50
Monkey climb tree. Monkey can climb.
Nora | 00:54
The monkey can climb trees. Great job.
Kai | 00:57
Blue blue ship.
Nora | 00:59
Okay, time is up. Good work today, Kai.`,
    supported: ['animal words elephant, giraffe, monkey', 'repeated "It\'s a big elephant" and "It can\'t swim" after a model', 'said "Monkey can climb" with partial independence', 'teacher repeated "swim" after Kai said a different word'],
    unsupported: ['any claim that Kai likes or wants pizza', 'a diagnosis that Kai mispronounces swim as swing (could be transcription)', '"blue ship" as a student mistake or interest', 'the German fragment as student speech', 'independent full sentences']
  },
  mixed_performance: {
    label: 'Mixed performance across activities',
    student: 'Lily', teacher: 'Nora',
    ratings: { numeric: '3.5', BEIDA: 'try_harder', OF: 'Medium' },
    transcript: `Nora | 00:00
Hi Lily. First, let's review the job words. What does a doctor do?
Lily | 00:05
A doctor helps sick people in a hospital.
Nora | 00:09
Excellent. And a farmer?
Lily | 00:12
A farmer grows food and has animals.
Nora | 00:16
Great. Now let's talk about the past. What did you do last weekend?
Lily | 00:21
I go to my grandma house.
Nora | 00:24
I went to my grandma's house.
Lily | 00:27
I went to my grandma house.
Nora | 00:30
Grandma's. Good. What did you do there?
Lily | 00:33
We eat cake and we play cards.
Nora | 00:37
We ate cake and we played cards.
Lily | 00:40
We ate cake and play cards.
Nora | 00:43
Played. Now read this story about a firefighter.
Lily | 00:47
"Tom is a firefighter. He puts out fires and helps people." He is brave.
Nora | 00:55
Lovely reading, and you added your own idea. One more past question: what did Tom do yesterday?
Lily | 01:01
Tom help a cat in a tree.
Nora | 01:04
Tom helped a cat. Okay, we'll keep working on past tense. Good job today.`,
    supported: ['described doctor and farmer jobs independently and correctly', 'read the firefighter story fluently and added "He is brave" herself', 'past tense errors: go/went, eat/ate, play/played, help/helped', 'corrected "went" and "ate" after a model but kept some errors'],
    unsupported: ['mastery of past tense', 'any previous lesson', 'pronunciation problems', 'homework assigned']
  },
  insufficient_evidence: {
    label: 'Missing or insufficient evidence',
    student: 'Ben', teacher: 'Nora',
    ratings: { numeric: '3', BEIDA: 'excellent', OF: 'Low/Medium' },
    transcript: `Lesson on clothes. We sang the clothes song and looked at pictures. Ben was a bit quiet today but joined in with the song.`,
    supported: ['topic: clothes', 'sang the clothes song and looked at pictures', 'was a bit quiet but joined in with the song'],
    unsupported: ['any specific clothes words Ben said', 'any sentence Ben produced', 'any grammar point', 'pronunciation', 'reading or writing', 'progress or improvement claims']
  },
  // Protocol audit 2026-10-24: the remaining scenario types. `essence` is what
  // a teacher would say mattered most; a report that misses it has failed even
  // when every sentence in it is true.
  barely_participates: {
    label: 'Student barely participates',
    student: 'Leo', teacher: 'Nora',
    ratings: { numeric: '2.5', BEIDA: 'try_harder', OF: 'Low/Medium' },
    transcript: `Nora | 00:00
Hi Leo! How are you today?
Leo | 00:04
Fine.
Nora | 00:05
Good. Today we talk about your house. How many rooms are in your house?
Leo | 00:11
Five.
Nora | 00:12
Five rooms. Can you say "There are five rooms in my house"?
Leo | 00:17
There are five rooms.
Nora | 00:19
Great. What's your favourite room?
Leo | 00:24
Bedroom.
Nora | 00:25
Why do you like your bedroom? Because...
Leo | 00:31
I don't know.
Nora | 00:33
Maybe because your games are there? Or your bed is comfortable?
Leo | 00:39
Games.
Nora | 00:40
My games are in my bedroom. Say it with me.
Leo | 00:43
My games are in my bedroom.
Nora | 00:46
Good. Now look at the picture. What is in the kitchen? There is a...
Leo | 00:53
Fridge.
Nora | 00:54
There is a fridge. What else? A table, a sink, a cooker. Can you find the sink?
Leo | 01:00
This.
Nora | 01:01
Yes. Leo, is everything okay? You are very quiet today.
Leo | 01:05
Tired.
Nora | 01:06
Okay. Let's finish with one question. Where do you eat dinner?
Leo | 01:12
Kitchen.
Nora | 01:13
In the kitchen. Thank you Leo. Rest well. Bye!`,
    essence: 'Leo said very little: one-word answers almost throughout; full sentences only when repeating a model. He said he was tired. Topic: rooms of the house and "there is / there are".',
    supported: ['rooms and kitchen words (bedroom, kitchen, fridge, sink)', 'repeated "There are five rooms" and "My games are in my bedroom" after a model', 'answered with single words', 'said "I don\'t know" once', 'said he was tired'],
    unsupported: ['any sentence Leo built on his own', 'enthusiasm, smiling or enjoying the lesson', 'behaviour problems or refusing to work', 'any previous lesson', 'homework assigned', 'mastery of there is / there are']
  },
  repeated_mistakes: {
    label: 'Repeated grammar mistake and a drilled pronunciation',
    student: 'Mila', teacher: 'Nora',
    ratings: { numeric: '3', BEIDA: 'try_harder', OF: 'Medium' },
    transcript: `Nora | 00:00
Hi Mila. Today: daily routines and the third person. Tell me about your brother's morning.
Mila | 00:07
My brother wake up at seven.
Nora | 00:10
He wakes up. Wakes, with an s.
Mila | 00:13
He wakes up at seven. Then he eat breakfast.
Nora | 00:17
He eats.
Mila | 00:18
He eats breakfast. He go to school by bus.
Nora | 00:22
He goes. Remember: he, she, it, add s or es.
Mila | 00:27
He goes to school by bus.
Nora | 00:30
Good. What does he eat for lunch?
Mila | 00:34
He like vegetables. Vegetables.
Nora | 00:38
He likes. And listen: VEG-ta-bles, three syllables, not ve-ge-ta-bles. Say it.
Mila | 00:45
Vegetables.
Nora | 00:46
Again, VEG-ta-bles.
Mila | 00:48
Vegetables. Vegetables.
Nora | 00:50
Good. Now your mum. What does she do in the evening?
Mila | 00:55
She cook dinner and she watch TV.
Nora | 00:59
She...?
Mila | 01:00
She cooks dinner and she watches TV.
Nora | 01:04
Yes! You fixed it yourself. Now ask me a question about my morning.
Mila | 01:09
What time you wake up?
Nora | 01:11
What time do you wake up?
Mila | 01:13
What time do you wake up?
Nora | 01:15
At six thirty. Last one: tell me about your dad.
Mila | 01:19
My dad works in a bank. He drive to work.
Nora | 01:24
Drives.
Mila | 01:25
He drives to work.
Nora | 01:27
The s is still tricky, but you fixed it on your own once. Practise he/she sentences. Bye Mila!`,
    essence: 'The central issue is the third-person -s, which Mila missed again and again (wake, eat, go, like, drive) and fixed after each correction; she self-corrected once ("She cooks dinner and she watches TV") after only "She...?". "Vegetables" (three syllables) was drilled. She also needed help with the question form "What time do you...".',
    supported: ['daily routine vocabulary', 'third-person -s missed repeatedly and corrected after a model each time', 'self-corrected "cooks" and "watches" after a one-word prompt', 'said "My dad works in a bank" correctly', 'pronunciation of "vegetables" practised as three syllables', 'question "What time do you wake up?" repeated after a model'],
    unsupported: ['mastery of the third-person -s', 'a description of how Mila mispronounced "vegetables" (the transcript only shows the drill)', 'any previous lesson', 'homework assigned (the teacher only suggested practice)', 'reading or writing']
  },
  multi_subject: {
    label: 'Complex lesson covering several subjects',
    student: 'Omar', teacher: 'Nora',
    ratings: { numeric: '4', BEIDA: 'excellent', OF: 'Medium/High' },
    transcript: `Nora | 00:00
Hi Omar! Busy lesson today: jobs, "can" and "can't", a short reading, and the "th" sound. First, jobs. What does a pilot do?
Omar | 00:09
A pilot flies a plane.
Nora | 00:12
Perfect. A chef?
Omar | 00:14
A chef cooks food in a restaurant.
Nora | 00:17
And a vet?
Omar | 00:19
A vet helps sick animals.
Nora | 00:22
Excellent, all on your own. Now "can" and "can't". Can a fish climb a tree?
Omar | 00:28
No, a fish can't climb a tree. A fish can swim.
Nora | 00:33
Great. Can you make a sentence about you?
Omar | 00:37
I can ride a bike but I can't play the piano.
Nora | 00:42
Lovely sentence with "but". Now reading. Read this paragraph about a firefighter.
Omar | 00:48
"Maria is a firefighter. She can drive a big truck. She helps people every day."
Nora | 00:56
Very good reading. Question: what can Maria drive?
Omar | 01:00
She can drive a big truck.
Nora | 01:03
Right. Last part: the "th" sound. Put your tongue between your teeth. Say "think".
Omar | 01:09
Sink.
Nora | 01:10
Tongue out: th-ink. Think.
Omar | 01:13
Think.
Nora | 01:14
Three.
Omar | 01:15
Tree. Three.
Nora | 01:17
Good, the second one. Thursday.
Omar | 01:20
Thursday.
Nora | 01:22
We'll keep working on "th". Great lesson, Omar!`,
    essence: 'Four parts, all handled well: Omar described jobs and used can/can\'t in his own full sentences without help (best: "I can ride a bike but I can\'t play the piano"), read the paragraph and answered the question. The "th" sound was the one area that needed correction and modelling (think, three, Thursday).',
    supported: ['job sentences produced independently (pilot, chef, vet)', 'can/can\'t sentences produced independently, including one with "but"', 'read the firefighter paragraph and answered a question about it', '"th" in think, three and Thursday practised with a model after corrections'],
    unsupported: ['a diagnosis that Omar says "s" for "th" beyond what the transcript shows (it shows "Sink" and "Tree" before corrections; treat as transcription-limited)', 'mastery of "th"', 'any previous lesson', 'homework assigned', 'writing']
  },
  long_buried: {
    label: 'Long lesson with the important detail buried',
    student: 'Lucas', teacher: 'Nora',
    ratings: { numeric: '3.5', BEIDA: 'try_harder', OF: 'Medium' },
    transcript: `Nora | 00:00
Hi Lucas, can you hear me? Your sound is a little quiet.
Lucas | 00:05
Hello? Can you hear me now?
Nora | 00:08
Yes, much better. How was your week?
Lucas | 00:11
Good. I played Minecraft a lot.
Nora | 00:14
Oh, what did you build?
Lucas | 00:17
A big castle with a dragon. And a farm with cows and chickens. And a secret room under the castle.
Nora | 00:26
That sounds amazing. Is the dragon friendly?
Lucas | 00:30
No, he is angry. He protects the castle.
Nora | 00:34
Ha, good idea. Do you play with friends?
Lucas | 00:37
Sometimes with my cousin. He lives in Spain.
Nora | 00:41
Nice. Okay, let's start. Today we practise the past simple with irregular verbs. Go becomes...?
Lucas | 00:48
Goed.
Nora | 00:49
Went. Go, went. Say "I went".
Lucas | 00:52
I went.
Nora | 00:53
Eat?
Lucas | 00:54
Eated. No. Ate.
Nora | 00:56
Yes, ate. See?
Lucas | 00:58
Saw.
Nora | 00:59
Good. Buy?
Lucas | 01:01
Buyed.
Nora | 01:02
Bought. Buy, bought. This one is difficult. Say "I bought".
Lucas | 01:06
I bought.
Nora | 01:07
Let's read a short text. "Last Saturday, Tom went to the market. He bought apples and saw his friend." Read it, please.
Lucas | 01:16
"Last Saturday, Tom went to the market. He bought apples and saw his friend."
Nora | 01:23
Very good. Where did Tom go?
Lucas | 01:26
He goed to the market. Went. He went to the market.
Nora | 01:30
Good fix. What did he buy?
Lucas | 01:33
He buyed apples.
Nora | 01:35
Bought.
Lucas | 01:36
He bought apples.
Nora | 01:38
Now you. Tell me about last weekend. What did you do?
Lucas | 01:42
On Saturday I went to the park with my dad. We saw a big dog. Then we ate ice cream.
Nora | 01:52
Lucas, that was perfect. Went, saw, ate, all correct, and nobody helped you. That's the most important thing today.
Lucas | 01:58
And on Sunday I buyed a new game.
Nora | 02:01
Bought.
Lucas | 02:02
I bought a new game.
Nora | 02:04
What game?
Lucas | 02:06
A football game. I play it with my cousin online.
Nora | 02:10
Do you like real football too?
Lucas | 02:13
Yes, I play on Wednesdays at school.
Nora | 02:16
Great. One more quick round. Drink?
Lucas | 02:19
Drank.
Nora | 02:20
Yes! Write?
Lucas | 02:22
Writed. Wrote.
Nora | 02:24
Wrote. Good fix. Okay, we're almost out of time. So: went, saw and ate you can use now. "Bought" still needs practice. Bye Lucas!
Lucas | 02:32
Bye!`,
    essence: 'Buried at 01:42: Lucas told his own weekend story with went, saw and ate all correct and without help; the teacher called it "the most important thing today". The clear difficulty is "bought" (said "buyed" three times) plus first-try "goed"/"writed". Minecraft and football chat are small talk, not the lesson.',
    supported: ['past simple irregular verbs (went, ate, saw, bought, drank, wrote)', 'own weekend story with went, saw and ate correct and unaided', 'said "buyed" repeatedly and corrected to "bought" after a model', 'self-corrected "goed" to "went", "eated" to "ate" and "writed" to "wrote"', 'read a short text aloud', 'chat about Minecraft and football'],
    unsupported: ['mastery of "bought"', 'Minecraft or the castle as lesson content', 'any previous lesson', 'homework assigned', 'pronunciation problems']
  },
  scout_format: {
    label: 'Scout transcript format (teacher models, student repeats)',
    student: 'Ella', teacher: 'Nora',
    ratings: { numeric: '4', BEIDA: 'excellent', OF: 'Medium' },
    transcript: `[00:00] TEACHER: Hi Ella! Today we describe animals with adjectives.
[00:04] STUDENT: Hi!
[00:06] TEACHER: Look at the elephant. The elephant is big and grey. Can you say it?
[00:11] STUDENT: The elephant is big and grey.
[00:14] TEACHER: Lovely. Now the giraffe. Tell me about it.
[00:18] STUDENT: The giraffe is tall. It has a long neck.
[00:22] TEACHER: Wonderful, you said that by yourself. The cheetah is the fastest animal in the world.
[00:28] STUDENT: Fast.
[00:29] TEACHER: The cheetah is very fast. Say the whole sentence.
[00:32] STUDENT: The cheetah is very fast.
[00:35] TEACHER: Which animal is your favourite?
[00:38] STUDENT: My favourite animal is the penguin because it is funny.
[00:43] TEACHER: Great reason! Penguins are black and white and they can't fly.
[00:48] STUDENT: Penguins can swim.
[00:50] TEACHER: Yes they can. Fantastic work today, Ella.`,
    essence: 'Ella\'s own sentences: "The giraffe is tall. It has a long neck." and "My favourite animal is the penguin because it is funny." plus "Penguins can swim." The elephant and cheetah sentences were repeated after a model. "Fastest animal in the world" and "can\'t fly" were only said by the teacher.',
    supported: ['adjectives for animals (big, grey, tall, fast, funny)', 'independent sentences about the giraffe, the penguin (with a reason) and "Penguins can swim"', 'repeated the elephant and cheetah sentences after a model'],
    unsupported: ['Ella saying the cheetah is the fastest animal in the world (teacher only)', 'Ella saying penguins can\'t fly (teacher only)', 'the elephant or cheetah sentence as independent work', 'superlatives practised by Ella', 'any previous lesson', 'homework assigned']
  }
};

const PROTOCOLS = ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];

function ratingFor(protocol, c){
  if(protocol === 'PREPLY') return '';
  if(protocol === 'BEIDA') return c.ratings.BEIDA;
  if(protocol === 'OF') return c.ratings.OF;
  return c.ratings.numeric;
}

// Blitz is the convenience protocol: teachers type 5-20 rough words, no
// transcript. These are the quick notes Blitz is judged on (owner assignment
// 2026-10-24). `keep`: facts the comment must still contain. `notClaim`: things
// it must not say. Every case carries a rating so the current production
// build (rating required) and V1.2 (rating optional) get identical inputs.
const BLITZ_NOTE_CASES = {
  minimal_positive: { student: 'Alex', rating: '4', notes: 'Alex was nice, animals and colours, good lesson, thanks.',
    keep: ['animals and colours', 'positive lesson / nice manner'], notClaim: ['specific words or activities', 'pronunciation, speaking or reading', 'improvement', 'participation details'] },
  minimal_mixed: { student: 'Lucy', rating: '3.5', notes: 'Lucy good attitude, past tense difficult, tried hard.',
    keep: ['good attitude', 'past tense was difficult', 'tried hard'], notClaim: ['mastery of the past tense', 'specific verbs or exercises', 'improvement'] },
  vague: { student: 'John', rating: '4', notes: 'John was great today. Thanks.',
    keep: ['positive impression'], notClaim: ['any lesson topic', 'any achievement or activity', 'participation details'] },
  behaviour_concern: { student: 'Mike', rating: '2.5', notes: 'Mike distracted today, interrupted often, animals lesson, answered a few questions.',
    keep: ['distracted / hard to focus', 'interrupted often', 'animals topic', 'answered a few questions (limited, not excellent)'], notClaim: ['excellent participation', 'specific animals or activities', 'causes of the behaviour'] },
  broken_english: { student: 'Emma', rating: '3.5', notes: 'emma nice girl learn fruits some hard she try good',
    keep: ['fruits topic', 'some of it was hard', 'she tried well'], notClaim: ['specific fruit words', 'mastery', 'activities'] },
  distracted_tried: { student: 'Tom', rating: '3', notes: 'Tom was distracted, struggled with vocabulary, but tried hard.',
    keep: ['distracted', 'vocabulary was a struggle', 'tried hard'], notClaim: ['specific vocabulary', 'a good or excellent lesson', 'improvement'] },
  shorthand: { student: 'Tim', rating: '4', notes: 'Tim good, animals colors, few words hard, nice class.',
    keep: ['animals and colours', 'a few words were hard', 'positive lesson'], notClaim: ['which words', 'exercises or games', 'pronunciation'] },
  repetitive: { student: 'Sara', rating: '4.5', notes: 'Very good very good. Good lesson. Good good.',
    keep: ['very positive lesson'], notClaim: ['any topic', 'any achievement or activity'] },
  multi_topic: { student: 'Ana', rating: '4', notes: 'Ana - weather words, clothes, present continuous, short reading. all good, continuous a bit hard',
    keep: ['weather words', 'clothes', 'present continuous', 'short reading', 'present continuous a bit hard', 'overall good'], notClaim: ['specific words', 'reading comprehension results'] },
  negative: { student: 'Ben', rating: '2', notes: 'Ben struggled a lot today, didnt know most numbers 11-20, needed lots of help, tired',
    keep: ['struggled a lot', 'numbers 11-20 mostly not known', 'needed lots of help', 'tired'], notClaim: ['progress', 'good performance', 'specific numbers he knew'] },
  special_remarks: { student: 'Kai', rating: '3', notes: 'Fruits and vegetables. Nice.', remarks: 'Was 15 minutes late and had the camera off for half the lesson.',
    keep: ['fruits and vegetables', 'positive manner', '15 minutes late', 'camera off for half the lesson'], notClaim: ['specific words', 'reasons for lateness'] },
  detailed: { student: 'Nina', rating: '4', notes: 'Unit 5 food and ordering in a restaurant. Role play waiter/customer went really well, she used "Can I have..." and "I would like..." on her own. Prices and numbers over 100 still slow. Spelling of "restaurant" and "vegetables" practised. Very motivated today, asked to do the role play twice.',
    keep: ['food / ordering in a restaurant', 'role play went well', '"Can I have" and "I would like" on her own', 'prices and big numbers still slow', 'spelling of restaurant and vegetables practised', 'motivated, asked to repeat the role play'], notClaim: ['pronunciation', 'other activities'] },
  no_topic: { student: 'Leo', rating: '4', notes: 'Great energy, very chatty and happy today.',
    keep: ['great energy', 'chatty', 'happy'], notClaim: ['any lesson topic', 'any skill achievement'] },
  ultra_sparse: { student: 'Max', rating: '3', notes: 'ok',
    keep: ['an okay lesson, nothing more'], notClaim: ['any topic', 'any praise beyond okay', 'any achievement or difficulty'] },
  informal_typos: { student: 'Omar', rating: '4', notes: 'hw done, revised past simple irreg verbs, sum mistakes w/ went/goed, gr8 convo about his holiday',
    keep: ['homework done', 'revised irregular past simple verbs', 'some mistakes with went (said goed)', 'great conversation about his holiday'], notClaim: ['mastery', 'other verbs', 'holiday details'] }
};

module.exports = { CASES, PROTOCOLS, ratingFor, BLITZ_NOTE_CASES };
