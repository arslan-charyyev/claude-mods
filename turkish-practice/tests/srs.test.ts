import { expect, test } from 'claude-code/testing'
import { parseLesson } from '../hooks/lesson.js'
import { answer, itemsFromCards, itemsFromLessons, mergeItems, pickCard, stagesOf, DAY, INTERVALS, LEARN_STEP, NEW_PER_DAY, RETRY_STEP } from '../hooks/srs.js'
import { CARDS, LESSON, NOW } from './fixtures.ts'

const lessonItems = () => itemsFromLessons([parseLesson(LESSON, '2026-10-02')])
const cardItems = () => itemsFromCards([{ ...CARDS, date: '2026-10-02' }])

test('a word starts with an intro, and only an item with a cloze gets the cloze stage', () => {
  const [word, sentence] = cardItems()
  expect(stagesOf(word)).toEqual(['intro', 'recognize', 'produce'])
  expect(stagesOf(sentence)).toEqual(['recognize', 'cloze', 'produce'])
  expect(stagesOf(lessonItems()[0])).toEqual(['recognize', 'produce'])
})

test('lesson items take wrong options from other sentences, the same ones every time', () => {
  const a = lessonItems()
  const b = lessonItems()
  expect(a.length).toBe(6)
  for (const it of a) {
    expect(it.distractors.length).toBe(3)
    expect(it.distractors).not.toContain(it.en)
  }
  expect(a.map((it) => it.distractors)).toEqual(b.map((it) => it.distractors))
})

test('a cards file item replaces the lesson item with the same Turkish; a broken cloze is dropped', () => {
  const merged = mergeItems(lessonItems(), cardItems())
  const tea = merged.filter((it) => it.tr === 'Bu çayı içemem.')
  expect(tea.length).toBe(1)
  expect(tea[0].source).toBe('cards')
  expect(tea[0].cloze.answer).toBe('emem')
  const broken = itemsFromCards([{ date: '2026-10-02', items: [{ kind: 'sentence', tr: 'X.', en: 'Y.', cloze: { text: 'no gap', options: ['a', 'b'], answer: 'a' } }, { kind: 'bogus', tr: 'Z', en: 'z' }] }])
  expect(broken.length).toBe(1)
  expect(broken[0].cloze).toBeUndefined()
})

test('right answers climb the stages, then the intervals; a wrong answer steps back', () => {
  const [, tea] = cardItems()
  let s = answer(tea, undefined, 'recognize', true, NOW)
  expect(s).toMatchObject({ stage: 'cloze', box: 0, due: NOW + LEARN_STEP, reps: 1 })
  s = answer(tea, s, 'cloze', true, NOW)
  expect(s).toMatchObject({ stage: 'produce', box: 0 })
  s = answer(tea, s, 'produce', true, NOW)
  expect(s).toMatchObject({ stage: 'produce', box: 1, due: NOW + INTERVALS[0] * DAY })
  s = answer(tea, s, 'produce', true, NOW)
  expect(s).toMatchObject({ box: 2, due: NOW + INTERVALS[1] * DAY })
  s = answer(tea, s, 'produce', false, NOW)
  expect(s).toMatchObject({ stage: 'cloze', box: 0, due: NOW + RETRY_STEP, lapses: 1, reps: 5 })
  // A word never falls back to its intro
  const [kira] = cardItems()
  expect(answer(kira, { stage: 'recognize', box: 0, due: NOW, reps: 1, lapses: 0 }, 'recognize', false, NOW).stage).toBe('recognize')
})

test('the next card is the longest-due item, then a new one, within the daily budget', () => {
  const items = mergeItems(lessonItems(), cardItems())
  const late = items.find((it) => it.tr === 'Otobüs çok dolu, binemiyoruz.')
  const later = items.find((it) => it.tr === 'Bu çayı içmem.')
  const state = {
    [later.id]: { stage: 'produce', box: 1, due: NOW - 1000, reps: 2, lapses: 0 },
    [late.id]: { stage: 'recognize', box: 0, due: NOW - 5000, reps: 1, lapses: 0 },
  }
  expect(pickCard(items, state, NOW, 0).item.id).toBe(late.id)
  // Nothing due: the newest new item, cards first, at its first stage
  const fresh = pickCard(items, {}, NOW, 0)
  expect(fresh).toMatchObject({ isNew: true, stage: 'intro' })
  expect(fresh.item.tr).toBe('kira')
  expect(pickCard(items, {}, NOW, NEW_PER_DAY)).toBe(null)
  expect(pickCard(items, {}, NOW, 0, () => false)).toBe(null)
})
