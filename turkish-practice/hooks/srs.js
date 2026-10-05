// Pure spaced-repetition logic: items, card stages, intervals, and the next card.
// No mods API here, so node and the test kit can both import this file.
//
// An item is one thing to learn: a word or a sentence. It moves through card
// stages from easy to hard. A right answer moves it one stage on; at the last
// stage (translate) it moves to a longer interval instead. A wrong answer moves
// it one stage back and brings it back soon.
//
//   word:     intro -> (recognize) -> (cloze) -> produce
//   sentence:                         (cloze) -> produce
//
// recognize: pick the meaning of a word (A-D), only when it has wrong options
// cloze:     pick the missing word (A-D), only when the item has a cloze
// produce:   type the Turkish for the English
//
// A sentence gets no meaning card: with whole sentences as options, the
// answer shows at a glance. Its choice card is the cloze, one word per option.

import { normalize } from './lesson.js'

export const MINUTE = 60 * 1000
export const DAY = 24 * 60 * MINUTE
// Days until the next review after each right answer at the translate stage
export const INTERVALS = [1, 3, 7, 21, 60]
// A learning step: the item comes back later in the same day
export const LEARN_STEP = 10 * MINUTE
// A wrong answer: the item comes back within the same sitting
export const RETRY_STEP = 3 * MINUTE
// New items a day
export const NEW_PER_DAY = 5

export function itemId(kind, tr) {
  return (kind === 'word' ? 'w:' : 's:') + normalize(tr)
}

const ALL_STAGES = ['intro', 'recognize', 'cloze', 'produce']

export function stagesOf(item) {
  return [
    ...(item.kind === 'word' ? ['intro'] : []),
    ...(item.kind === 'word' && item.distractors.length > 0 ? ['recognize'] : []),
    ...(item.cloze ? ['cloze'] : []),
    'produce',
  ]
}

// The stage an item shows when its saved stage is not one of its own (a
// sentence saved at the meaning card that this item no longer has): the next one it has
export function stageFor(item, stage) {
  const stages = stagesOf(item)
  const at = ALL_STAGES.indexOf(stage)
  return stages.find((x) => ALL_STAGES.indexOf(x) >= at) ?? stages[stages.length - 1]
}

// Sentence items from parsed lessons. Two sentences that differ in one word
// (the contrast pair is one) give each other a cloze: that word, with the
// other sentence's word as the wrong option, and the English as the hint.
// Misspellings of the answer fill the options up to four.
export function itemsFromLessons(lessons) {
  const raw = []
  for (const l of lessons) {
    for (const s of [...l.sentences, ...l.drill]) {
      // Lesson items come after a day's cards items: their order starts at 1000
      raw.push({ kind: 'sentence', tr: s.tr, en: s.en, note: s.note ?? '', date: l.date, source: 'lesson', order: 1000 + raw.length })
    }
  }
  const byId = new Map()
  for (const it of raw) {
    const id = itemId(it.kind, it.tr)
    if (!byId.has(id)) byId.set(id, { ...it, id })
  }
  const all = [...byId.values()]
  // Every word of the lessons: a misspelling that is a real word is never an option
  const vocab = new Set(all.flatMap((it) => normalize(it.tr).split(' ')))
  for (const it of all) {
    it.distractors = []
    const cloze = pairCloze(it, all, vocab)
    if (cloze) it.cloze = cloze
  }
  return all
}

const EDGE = /^([^\p{L}]*)(.*?)([^\p{L}]*)$/u

// The cloze from the sentences that differ from `it` in one word only, at the
// place where most of them differ
function pairCloze(it, all, vocab) {
  const words = it.tr.split(/\s+/)
  const byPlace = new Map()
  for (const o of all) {
    if (o.id === it.id || o.en === it.en) continue
    const other = o.tr.split(/\s+/)
    if (other.length !== words.length) continue
    const diff = words.flatMap((w, i) => (normalize(w) === normalize(other[i]) ? [] : [i]))
    if (diff.length !== 1) continue
    const option = other[diff[0]].match(EDGE)[2]
    if (!option) continue
    byPlace.set(diff[0], [...(byPlace.get(diff[0]) ?? []), option])
  }
  if (byPlace.size === 0) return undefined
  const [place, wrong] = [...byPlace.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0]
  const [, before, answer, after] = words[place].match(EDGE)
  const options = [...new Set([answer, ...wrong])].slice(0, 4)
  if (options.length < 2) return undefined
  const taken = (w) => vocab.has(normalize(w)) || options.some((o) => normalize(o) === normalize(w))
  options.push(...misspellings(answer, taken).slice(0, 4 - options.length))
  const text = words.map((w, i) => (i === place ? before + '___' + after : w)).join(' ')
  return { text, hint: it.en, options, answer }
}

// A vowel that breaks the vowel harmony, and a Turkish letter without its dots
// or its cedilla (or with them where none belong)
const HARMONY_SWAPS = { e: 'a', a: 'e' }
const LETTER_SWAPS = { ı: 'i', i: 'ı', ş: 's', s: 'ş', ç: 'c', c: 'ç', ğ: 'g', g: 'ğ', ö: 'o', o: 'ö', ü: 'u', u: 'ü' }

// Misspellings of a word, one letter off each, for the wrong options of a cloze.
// The end of a word carries the suffixes, so the changes start there; the first
// letter stays. One of each kind comes first, then the rest. `taken` rules out
// a real word and an option the cloze already has.
export function misspellings(word, taken) {
  const letters = Array.from(word)
  const variants = (swaps) => {
    const out = []
    for (let i = letters.length - 1; i > 0; i--) {
      const swap = swaps[letters[i]]
      if (!swap) continue
      const v = [...letters.slice(0, i), swap, ...letters.slice(i + 1)].join('')
      if (!taken(v) && !out.includes(v)) out.push(v)
    }
    return out
  }
  const harmony = variants(HARMONY_SWAPS)
  const letter = variants(LETTER_SWAPS)
  const first = [harmony[0], letter[0]].filter(Boolean)
  return [...new Set([...first, ...harmony.slice(1), ...letter.slice(1)])]
}

// Items from the daily cards files (cards/<date>.json), which the lesson job
// writes with checked wrong options and cloze gaps
export function itemsFromCards(files) {
  const out = []
  for (const f of files) {
    for (const [order, c] of (f.items ?? []).entries()) {
      if (!c || (c.kind !== 'word' && c.kind !== 'sentence') || !c.tr || !c.en) continue
      const cloze = validCloze(c.cloze) ? c.cloze : undefined
      out.push({
        id: itemId(c.kind, c.tr),
        kind: c.kind,
        tr: c.tr,
        en: c.en,
        note: c.note ?? '',
        example: c.example?.tr && c.example?.en ? c.example : undefined,
        distractors: Array.isArray(c.distractors) ? c.distractors.filter((d) => typeof d === 'string' && d !== c.en).slice(0, 3) : [],
        ...(cloze ? { cloze } : {}),
        date: f.date,
        source: 'cards',
        order,
      })
    }
  }
  return out
}

function validCloze(c) {
  return (
    c &&
    typeof c.text === 'string' &&
    c.text.includes('___') &&
    Array.isArray(c.options) &&
    c.options.length >= 2 &&
    c.options.includes(c.answer) &&
    new Set(c.options).size === c.options.length
  )
}

// A cards item replaces a lesson item with the same Turkish, and keeps the
// lesson's cloze when it has none of its own
export function mergeItems(lessonItems, cardItems) {
  const byId = new Map(lessonItems.map((it) => [it.id, it]))
  for (const c of cardItems) {
    const old = byId.get(c.id)
    byId.set(c.id, old && old.cloze && !c.cloze ? { ...c, cloze: old.cloze } : c)
  }
  return [...byId.values()]
}

// The card to show now: the item that has been due longest, then a new item
// while today's budget lasts (newest day first; within a day, the cards file's
// order, then the lesson's).
// `newAllowed` limits new items to the recent lessons, and `fits(item, stage)`
// limits the card types (the band shows no typed cards).
export function pickCard(items, state, now, newToday, newAllowed = () => true, fits = () => true) {
  const due = items
    .filter((it) => state[it.id] && state[it.id].due <= now && fits(it, state[it.id].stage))
    .sort((a, b) => state[a.id].due - state[b.id].due)
  if (due.length > 0) return { item: due[0], stage: state[due[0].id].stage, isNew: false }
  if (newToday >= NEW_PER_DAY) return null
  const fresh = items
    .filter((it) => !state[it.id] && newAllowed(it) && fits(it, stagesOf(it)[0]))
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1))
  if (fresh.length === 0) return null
  return { item: fresh[0], stage: stagesOf(fresh[0])[0], isNew: true }
}

// The next item to come due, for "Practice more" and the "next review" line
export function nextDue(items, state, fits = () => true) {
  return items.filter((it) => state[it.id] && fits(it, state[it.id].stage)).sort((a, b) => state[a.id].due - state[b.id].due)[0] ?? null
}

// The new state of an item after one answer at one stage
export function answer(item, prev, stage, isRight, now) {
  const stages = stagesOf(item)
  const i = Math.max(0, stages.indexOf(stage))
  const base = prev ?? { stage, box: 0, due: now, reps: 0, lapses: 0 }
  const reps = base.reps + 1
  if (!isRight) {
    // One stage back, but never back to the intro
    const back = Math.max(stages[0] === 'intro' ? 1 : 0, i - 1)
    return { ...base, stage: stages[back], box: 0, due: now + RETRY_STEP, reps, lapses: base.lapses + 1 }
  }
  if (i < stages.length - 1) {
    // Still learning: the next, harder card later today
    return { ...base, stage: stages[i + 1], due: now + (stage === 'intro' ? MINUTE : LEARN_STEP), reps }
  }
  // Translate stage: the next interval
  const box = Math.min(base.box + 1, INTERVALS.length)
  return { ...base, stage, box, due: now + INTERVALS[box - 1] * DAY, reps }
}

// Counts for the header: due now, learning, known
export function summary(items, state, now) {
  let due = 0
  let learning = 0
  let known = 0
  for (const it of items) {
    const s = state[it.id]
    if (!s) continue
    if (s.due <= now) due++
    if (s.box === 0) learning++
    else known++
  }
  return { due, learning, known }
}
