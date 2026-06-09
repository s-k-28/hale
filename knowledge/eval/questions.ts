/**
 * EvalAgent question set — 25 things a real quitting user asks. Used by
 * convex/sageKnowledge.ts `runEval` to verify retrieval returns on-topic chunks.
 * `topic` is the namespace we EXPECT to dominate the results (loose check).
 */
import type { Topic } from '../sources.config';

export const EVAL_QUESTIONS: { q: string; topic: Topic }[] = [
  { q: "I'm 3 days in and I want to scream, is this normal?", topic: 'withdrawal' },
  { q: 'How long do nicotine cravings actually last?', topic: 'cravings' },
  { q: "I can't sleep at all since I quit vaping", topic: 'withdrawal' },
  { q: 'Why am I so angry and irritable at everyone?', topic: 'withdrawal' },
  { q: 'I keep getting headaches and brain fog, is that the quitting?', topic: 'withdrawal' },
  { q: "I'm terrified I'm going to gain a ton of weight", topic: 'withdrawal' },
  { q: 'A craving just hit me hard at work, what do I do right now?', topic: 'cravings' },
  { q: 'I always smoke after meals, how do I stop that?', topic: 'behavioral' },
  { q: 'Coffee makes me want a cigarette so badly', topic: 'behavioral' },
  { q: 'What is urge surfing and does it actually work?', topic: 'behavioral' },
  { q: 'How do I deal with triggers when everyone around me smokes?', topic: 'behavioral' },
  { q: 'I relapsed last night, am I done, did I ruin everything?', topic: 'relapse' },
  { q: 'I slipped and had one puff, should I just give up now?', topic: 'relapse' },
  { q: 'How do I stop a slip from turning into full relapse?', topic: 'relapse' },
  { q: 'Why is nicotine so addictive in the first place?', topic: 'mechanism' },
  { q: 'What does nicotine actually do to my brain?', topic: 'mechanism' },
  { q: 'Is vaping safer to quit with than cigarettes?', topic: 'nrt' },
  { q: 'Do nicotine patches or gum actually help you quit?', topic: 'nrt' },
  { q: "What's the difference between the patch and the gum?", topic: 'nrt' },
  { q: 'My teenager is vaping, how do I help them quit?', topic: 'teen' },
  { q: 'Is vaping bad for teens or is it basically harmless?', topic: 'teen' },
  { q: "I'm anxious all the time now, will it go away?", topic: 'withdrawal' },
  { q: 'I feel depressed since quitting, is that a thing?', topic: 'withdrawal' },
  { q: 'I get cravings when I drink alcohol with friends', topic: 'behavioral' },
  { q: "I'm bored and that's when I want to vape most", topic: 'behavioral' },
];
