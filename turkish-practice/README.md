# turkish-practice

Turkish flashcards with spaced repetition, in the Claude Desktop Code tab. The cards come from my daily lessons, and every answer goes back to the lesson job, so the next lesson reacts to my mistakes.

It draws in the Desktop app only. In a terminal session it loads, but it draws nothing.

## What it shows

- **The band above the prompt** shows the card that is due. An answered card makes room for the next one when Claude's next answer ends, or at once on **→ Next**. An unanswered card stays, so no card goes by unseen. `⏭` skips a card for this session, and `⤢` opens the pane.
- **`/tr`** opens a pane to study card after card, with today's progress ring and counts. `/tr lesson` opens today's lesson, with the answers hidden until a press.

## The cards

Each item (a word or a sentence) moves through card types from easy to hard:

| Card | What I do | Items |
| --- | --- | --- |
| New word | Read the word, its meaning, and an example | words |
| What does it mean? | Pick the English meaning, A to D | all |
| Fill the gap | Pick the missing form, A to D | items with a cloze |
| Translate into Turkish | Type the Turkish sentence | all |

A right answer moves the item to the next card type, which comes back 10 minutes later. At the translate card, a right answer moves it to the next interval instead: 1, 3, 7, 21, then 60 days. A wrong answer moves it one card type back and brings it back in 3 minutes. Translate answers are graded word by word: missing Turkish letters (`karanlik` for `karanlık`) still count as right, and a different sentence asks me whether mine is right too, because Turkish word order is free.

The next card is the item that has been due longest. When nothing is due, a new item comes, at most 5 a day, only from the lessons and cards of the last 7 days: newest day first, in the order of its cards file.

## Data

The learning data stays in `~/.claude/turkish`, outside this repository:

| File | Written by | What it holds |
| --- | --- | --- |
| `lessons/<date>.md` | the daily lesson job | The lesson. Its examples, contrast pair, drill with answers, and sentence of the day become sentence items. Their wrong meanings come from other sentences of the same lesson. |
| `cards/<date>.json` | the daily lesson job | Words and sentences with checked wrong meanings and cloze gaps. A cards item replaces a lesson item with the same Turkish. |
| `practice-log.json` | this mod | Every answer: the item, the card type, what I gave, what was expected, and whether it was right |
| `practice-state.json` | this mod | Where each item stands: card type, interval, and wrong answers so far |

The lesson job reads the last two files to choose between a new lesson and a repeat, and to find my weak points. `DAILY-LESSON-PROMPT.md` in the data folder is the authority on the cards file format. In short:

```json
{
  "point": "4. Ability and inability",
  "items": [
    { "kind": "word", "tr": "kira", "en": "rent", "example": { "tr": "Bu ay kirayı ödeyemem.", "en": "I can't pay the rent this month." }, "distractors": ["bill", "salary", "price"] },
    { "kind": "sentence", "tr": "Bu çayı içemem.", "en": "I can't drink this tea.", "distractors": ["I don't drink this tea.", "I can drink this tea.", "I didn't drink this tea."],
      "cloze": { "text": "Bu çayı iç___.", "hint": "The tea is too hot.", "options": ["emem", "mem", "ebilirim", "medim"], "answer": "emem", "explain": "`iç-eme-m`: a limit." } }
  ]
}
```

The mod skips an item that has no `tr` or `en`, and drops a `cloze` without exactly one `___`, with duplicate options, or without its `answer` among the options.

The scheduler state, the daily new-item count, and the log also live in the mod's own store, `~/.claude/plugins/store/turkish-practice_inline-*.json`, which every session shares.

## Setup

In `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/mnt/data/Dev/projects/linux/arslan-charyyev/claude-mods/turkish-practice",
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` turns mods on in Claude Code engines older than 2.1.287, such as 2.1.286 in Claude Desktop 2.19675.0. Version 2.1.287 and later ignore it, so remove it once the Desktop app ships such an engine. The Desktop app draws mods from 2.19675.0 on.

## Files

| File | What it does |
| --- | --- |
| `hooks/register.js` | The hooks: loading, the band, the pane, the `/tr` command, and saving answers |
| `hooks/srs.js` | The scheduler: items, card stages, intervals, and the next card |
| `hooks/lesson.js` | The lesson parser and the translation grading |
| `hooks/svg.js` | The progress ring |
| `tests/` | `claude plugin test` suites, with shared fixtures in `fixtures.ts` |

## Test

```
claude plugin validate .
capped claude plugin test
```
