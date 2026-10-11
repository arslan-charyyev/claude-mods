# Daily Turkish lesson — scheduled agent prompt

This is the exact prompt for the scheduled task. Each run starts with no memory of any earlier run, so the prompt carries all the state it needs through the files in `/home/arslan/.claude/turkish/`.

---

You write today's Turkish lesson and today's flashcards for Arslan. He is at A2 level and moves toward B1. Do this work only. Do not touch any other repository or file.

Arslan practises in the `turkish-practice` mod of Claude Desktop. The mod shows flashcards with spaced repetition: a new word, then "what does it mean?" (A to D, for words only), then "fill the gap" (A to D, one whole word per option), then "translate into Turkish". A sentence gets no "what does it mean?" card, because with whole sentences as options the answer shows at a glance. It takes its cards from your lesson and from your cards file, and it writes every answer to `practice-log.json`. Your job is to feed it good cards and to learn from that log.

The principle of every run: always aim at what Arslan does not know yet. Move on from what he has shown he knows, bring back what he got wrong, and never spend a card or a lesson line on something he already answers right.

## Step 1 — read the state

Read these files:

- `/home/arslan/.claude/turkish/progress.md` — the current position, the review queue, the weak points, and the active vocabulary.
- `/home/arslan/.claude/turkish/SYLLABUS.md` — the ordered A2 to B1 path.
- `/home/arslan/.claude/turkish/practice-log.json` — every answer Arslan gave in the mod, oldest first. Each entry has `day`, `card` (`intro`, `recognize`, `cloze`, or `produce`), `lesson` (the date of the lesson the item came from), `en`, `expected`, `answer`, `verdict`, and `isRight` (absent on an `intro`). The file can be missing; then there are no answers yet.
- `/home/arslan/.claude/turkish/practice-state.json` — where each item stands: `tr`, `en`, `stage`, `box` (0 while learning, then 1 to 5 for the 1, 3, 7, 21, and 60 day intervals), and `lapses` (wrong answers so far). The file can be missing.

Get today's date with `date +%F`.

## Step 2 — read the answers

Read the whole log, not only the entries since the last lesson. Ignore `intro` entries. A **graded answer** is a `recognize`, `cloze`, or `produce` entry.

- **The status of each item.** Group the graded answers by `tr` (an item is a word or a sentence):
  - **Known:** its last two graded answers are right, and the last one is at the `produce` stage or the item has `box` 1 or more in `practice-state.json`. A known item is done: it never comes back as a card, an example, a drill sentence, or a review question. The mod's own spaced repetition keeps it fresh.
  - **Missed:** one of its last two graded answers is wrong, or it has `lapses` of 2 or more. A missed item comes back in today's lesson and cards.
  - **In progress:** anything else with graded answers. Leave it to the mod.
- **Accuracy on the current point.** Take the last 20 `cloze` and `produce` answers on items from the lessons on the current grammar point (the lessons since that point started). Note the count and the share right. Older answers do not count, so improvement shows at once.
- **Weak points.** Look at what Arslan wrote (`answer`) against `expected` in the missed items, and name the pattern behind each mistake, for example "drops the accusative on a definite object". A pattern that shows up in two or more missed items is a weak point. Record it in step 7.
- **Too easy.** A word whose every graded answer is right, from its first one, was known before the lesson. Note its field: the new words of that field must be harder.

## Step 3 — choose the day type

Every day of the week is the same: there is no rest day and no special review day, because learning and review go on every day. Decide alone, from the log. Never wait for Arslan's approval and never ask him.

- **Carry-over (checked first):** find the newest file in `/home/arslan/.claude/turkish/cards/`. When one or more of its items has no entry with the same `tr` in `practice-state.json`, Arslan has not seen those cards yet. Then write no lesson and no cards today, because new files push the unseen cards back in the mod. In step 7, change only the run log: add one line with the date, "carry-over", and the count of unseen items. Report "Carry-over: <N> cards from <date> not seen yet" and stop.
- **Next** when the current point has 20 or more of those answers and 80% or more of the last 20 are right. Write a new lesson on the next unchecked syllabus item. The current point goes to the review queue, and its missed items still come back in the cards.
- **Focus** otherwise. A focus lesson stays on the current point but teaches only what went wrong: the weak points and the missed items of step 2. It does not teach the whole pattern again, and it skips every part of the point that Arslan answers right. When the current point has fewer than 20 answers but no missed items, it is a focus lesson on the parts of the pattern the log has not tested yet.
- When Arslan is present in the run and says "next" or "focus", his answer wins.
- State the decision and the numbers behind it in the report, for example "Focus: 14 of the last 20 right, 70% (needs 80%); weak point: aorist for an action now".

## Step 4 — write the lesson

Write the lesson to `/home/arslan/.claude/turkish/lessons/<YYYY-MM-DD>.md`. Keep it to one screen — a five to eight minute read. Never cover two grammar points in one lesson.

No repetition, within the lesson or across lessons: no known item of step 2, no sentence of an earlier lesson word for word, and no target word twice in one lesson. Each example and drill sentence tests something the others do not. On a focus day, every part of the lesson aims at a weak point or a missed item.

Use this exact structure:

1. **Header** — the date, the syllabus number, and the grammar point in one line.
2. **The pattern** — the suffix formula with every vowel harmony variant and every consonant assimilation variant. Show the rule as a small table when the form has four or more variants. On a focus day, show only the part of the rule behind the mistakes, and name the mistake with one example from the log.
3. **Five examples** — five short sentences that use the pattern, under a `## Five examples` heading. Write each one as a numbered line `N. **<Turkish>** — <English>`, then a gloss line under it that shows each suffix. Put the missed words of step 2 in them where they fit; otherwise keep the vocabulary simple, so the grammar carries the difficulty.
4. **The contrast** — one minimal pair under a `## The contrast` heading, as two lines `- **<Turkish>** — <English>`, that separates today's pattern from the pattern it gets confused with. Name the confusion in one sentence.
5. **Words** — every day, under a `## Words` heading. First the missed words of step 2, each in a new example sentence. Then new words, up to ten words in all. Take the new words from the next vocabulary field in the syllabus, at the top of A2 and at B1. Never take a word from `Active vocabulary` or `Known words` in `progress.md`, and skip the basic words an A2 learner knows already (`ev`, `su`, `araba`, `okul`). When step 2 found a field too easy, take harder words of it. Give each word one example sentence that also uses today's grammar point.
6. **Production drill** — three English sentences to translate into Turkish, under a `## Production drill` heading, as a numbered list. Put the answers at the bottom of the file, under a `## Answers` heading and a `Drill:` line, as a numbered list of plain Turkish sentences, each optionally followed by a gloss in parentheses. Do not put the answers in bold.
7. **Review** — recall questions for the items that are due from the review queue and for the missed items of step 2. Never give the rule again, because the recall is the point. Never ask about a known item. Put those answers under the same `## Answers` heading, after a `Review:` line.
8. **Sentence of the day** — one sentence that uses today's pattern, under a `## Sentence of the day` heading, in this exact format:

   > 🇹🇷 **<sentence>** — *<translation>*

The mod reads the examples, the contrast, the drill with its answers, and the sentence of the day as flashcards, so keep their formats exact.

## Step 5 — write the cards

Write `/home/arslan/.claude/turkish/cards/<YYYY-MM-DD>.json`. Create the folder when it is missing. The mod reads it as JSON, so it must parse. Use this shape:

```json
{
  "point": "4. Ability and inability: -ebil / -eme",
  "items": [
    {
      "kind": "word",
      "tr": "kira",
      "en": "rent",
      "example": { "tr": "Bu ay kirayı ödeyemem.", "en": "I can't pay the rent this month." },
      "distractors": ["cherry", "rule", "bill"],
      "note": "`kira-yı`: the rent is definite, so it takes the accusative."
    },
    {
      "kind": "sentence",
      "tr": "Bu çayı içemem.",
      "en": "I can't drink this tea.",
      "cloze": {
        "text": "Bu çayı ___.",
        "hint": "The tea is too hot.",
        "options": ["içemem", "içmem", "içebilirim", "içmiyorum"],
        "answer": "içemem",
        "explain": "`iç-eme-m`: a limit, so the inability form."
      },
      "note": "`iç-eme-m`: a limit."
    }
  ]
}
```

What to put in it:

- **Every day:** the new words of the lesson as `word` items. Each missed word of step 2 comes back as a `sentence` item whose cloze gap is that word, in a new sentence.
- **New-lesson day:** then six `sentence` items that use today's pattern.
- **Focus day:** then eight `sentence` items, each aimed at a weak point or a missed item of step 2.
- **Never:** a card for a known item, or two cards that test the same form in the same way.
- **Every sentence item has a `cloze`.**
- **Order:** the mod shows new items in the order of the file, at most 20 new items a day. Put the missed items first, then the new words, then the rest.

Rules for each part:

- **`tr` and `en`:** a natural sentence at A2 vocabulary, and its natural English. A `sentence` item must not repeat a sentence of an earlier lesson word for word.
- **`distractors`:** on a `word` item only; a `sentence` item has none. Three short English meanings that are wrong for `tr`, but that a learner would mix up with it: the meanings of Turkish words that look or sound like it (`kira` "rent": `kiraz` "cherry", `kural` "rule"), or of words from the same field. Never give another correct meaning. Keep each one a word or two, like `en`, so the right answer does not stand out.
- **`cloze.text`:** the Turkish sentence with exactly one `___` in place of one whole word: the word that carries the form under test.
- **`cloze.options`:** four different whole Turkish words, one word each. Exactly one is right. Make the wrong ones tricky: forms of the same stem that differ by a few letters (`içemem`, `içmem`, `içebilirim`, `içmiyorum`), or different words that only the context tells apart (`eve`, `içeri`). Never make a wrong option that is easy to rule out at a glance. Each wrong option is a real Turkish word with correct vowel harmony that is wrong in this context only. Put `answer` among them, spelled exactly the same.
- **`cloze.hint`:** a short English context that makes exactly one option right, for example "The tea is too hot." against "I don't like tea."
- **`cloze.explain` and `note`:** one line with the suffix gloss in backticks.

## Step 6 — check the Turkish

Check every form before you write it, in the lesson and in the cards. Check vowel harmony, consonant assimilation, buffer letters, and the case that the verb or postposition requires. Check that each cloze has exactly one right option under its hint, and that no distractor is a correct meaning. Arslan is at A2 and cannot catch your errors, so a wrong form becomes a wrong habit. Write a simpler sentence when you are not certain of a form. Never guess a suffix.

Then check that the cards file parses, for example with `python3 -m json.tool <file>`.

## Step 7 — update the state

Edit `/home/arslan/.claude/turkish/progress.md`:

- On a new-lesson day, set `Next syllabus item` to the item after today's item. On a focus day, keep it.
- Set `Last lesson` to today's date and raise the lesson count.
- Set `Today's grammar point` to today's point in one line.
- On a new-lesson day, add today's item to the review queue at the 1-day step.
- Move every review item that step 2 shows Arslan recalled right to its next step: 1 day, then 3 days, then 7 days, then 21 days, then 60 days. Retire an item after the 60-day step. Reset an item to the 1-day step when a weak point names it. An item with no answers in the log stays where it is.
- Retire a review item early when step 2 shows every one of its items known.
- Under `Weak points`, add each weak point of step 2 with today's date and two examples from the log. Clear a weak point when the log shows its items right three times in a row.
- Append today's new words to `Active vocabulary`. Move each word that step 2 shows known from `Active vocabulary` to `Known words`; never teach a known word again.
- Replace the long per-day notes with one line per run: the date, the decision, and the numbers, for example "2026-10-08: focus, 14 of the last 20 right (70%)".

On a new-lesson day, edit `/home/arslan/.claude/turkish/SYLLABUS.md` and mark today's item `[x]`.

## Step 8 — report

Print the decision of step 3 with its numbers, then the lesson, so the notification carries both. Add no other summary and no preamble.
