// Pure spaced-repetition logic: items, card stages, intervals, and the next card.
// No mods API here, so node and the test kit can both import this file.
//
// An item is one thing to learn: a word or a sentence. It moves through card
// stages from easy to hard. A right answer moves it one stage on; at the last
// stage (translate) it moves to a longer interval instead. A wrong answer moves
// it one stage back and brings it back soon.
//
//   word:     intro -> recognize -> (cloze) -> produce
//   sentence:          recognize -> (cloze) -> produce
//
// recognize: pick the meaning of the Turkish (A-D)
// cloze:     pick the missing form (A-D), only when the item has a cloze
// produce:   type the Turkish for the English

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

export function stagesOf(item) {
  return [...(item.kind === 'word' ? ['intro'] : []), 'recognize', ...(item.cloze ? ['cloze'] : []), 'produce']
}

// A small seeded generator, so an item gets the same distractors every time
function seeded(text) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function seededShuffle(list, seed) {
  const random = seeded(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Sentence items from parsed lessons. Their wrong options are the meanings of
// other sentences, taken first from the same lesson, which tests the same grammar.
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
  for (const it of all) {
    const sameLesson = all.filter((o) => o.id !== it.id && o.date === it.date && o.en !== it.en).map((o) => o.en)
    const others = all.filter((o) => o.id !== it.id && o.date !== it.date && o.en !== it.en).map((o) => o.en)
    it.distractors = [...seededShuffle(sameLesson, it.id), ...seededShuffle(others, it.id)].slice(0, 3)
  }
  return all
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

// A cards item replaces a lesson item with the same Turkish, and a lesson item
// without enough wrong options borrows them from its own lesson's pool
export function mergeItems(lessonItems, cardItems) {
  const byId = new Map(lessonItems.map((it) => [it.id, it]))
  for (const c of cardItems) {
    const old = byId.get(c.id)
    byId.set(c.id, old && c.distractors.length < 3 ? { ...c, distractors: [...c.distractors, ...old.distractors].slice(0, 3) } : c)
  }
  return [...byId.values()]
}

// The card to show now: the item that has been due longest, then a new item
// while today's budget lasts (newest day first; within a day, the cards file's
// order, then the lesson's).
// `newAllowed` limits new items to the recent lessons.
export function pickCard(items, state, now, newToday, newAllowed = () => true) {
  const due = items.filter((it) => state[it.id] && state[it.id].due <= now).sort((a, b) => state[a.id].due - state[b.id].due)
  if (due.length > 0) return { item: due[0], stage: state[due[0].id].stage, isNew: false }
  if (newToday >= NEW_PER_DAY) return null
  const fresh = items
    .filter((it) => !state[it.id] && newAllowed(it))
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1))
  if (fresh.length === 0) return null
  return { item: fresh[0], stage: stagesOf(fresh[0])[0], isNew: true }
}

// The next item to come due, for "Practice more" and the "next review" line
export function nextDue(items, state) {
  return items.filter((it) => state[it.id]).sort((a, b) => state[a.id].due - state[b.id].due)[0] ?? null
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
