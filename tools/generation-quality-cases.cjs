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
  }
};

const PROTOCOLS = ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];

function ratingFor(protocol, c){
  if(protocol === 'PREPLY') return '';
  if(protocol === 'BEIDA') return c.ratings.BEIDA;
  if(protocol === 'OF') return c.ratings.OF;
  return c.ratings.numeric;
}

module.exports = { CASES, PROTOCOLS, ratingFor };
