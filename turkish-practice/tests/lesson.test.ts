import { expect, test } from 'claude-code/testing'
import { grade, parseLesson, splitNote } from '../hooks/lesson.js'
import { progressRing } from '../hooks/svg.js'
import { LESSON } from './fixtures.ts'

test('the parser reads examples, contrast, drill answers, and the sentence of the day', () => {
  const l = parseLesson(LESSON, '2026-10-02')
  expect(l.sentences.map((s) => s.kind)).toEqual(['example', 'example', 'contrast', 'contrast', 'sotd'])
  expect(l.drill).toEqual([{ en: "The room is dark; I can't find my keys.", tr: 'Oda karanlık, anahtarlarımı bulamıyorum.', note: '`bul-amı-yor-um`: a limit.', kind: 'drill', date: '2026-10-02' }])
  expect(splitNote('Pencereyi açabilir miyim?')).toEqual({ tr: 'Pencereyi açabilir miyim?', note: '' })
  expect(splitNote('**Bu ay kirayı ödeyemem.** (`kira-yı`: the accusative.)')).toEqual({ tr: 'Bu ay kirayı ödeyemem.', note: '`kira-yı`: the accusative.' })
  expect(splitNote('**Anahtarı evde bulamıyorum.**')).toEqual({ tr: 'Anahtarı evde bulamıyorum.', note: '' })
})

test('grading tells a missing Turkish letter from a wrong word, and keeps the spelling', () => {
  const expected = 'Oda karanlık, anahtarlarımı bulamıyorum.'
  expect(grade('Oda karanlık, anahtarlarımı bulamıyorum', expected).verdict).toBe('exact')
  expect(grade('oda karanlik anahtarlarimi bulamiyorum', expected).verdict).toBe('letters')
  const g = grade('Oda karanlık, anahtarlarımı bulmuyorum', expected)
  expect(g.verdict).toBe('different')
  expect(g.words.map((w) => w.status)).toEqual(['ok', 'ok', 'ok', 'missing'])
  expect(g.words.map((w) => w.raw)).toEqual(['Oda', 'karanlık,', 'anahtarlarımı', 'bulamıyorum.'])
  // Turkish casing: the capital I is the dotless ı
  expect(grade('ILIK', 'ılık').verdict).toBe('exact')
  // An apostrophe keeps a word whole
  const p = grade('istanbula gidiyorum', "İstanbul'a gidiyorum.")
  expect(p.verdict).toBe('exact')
  expect(p.words.map((w) => w.word)).toEqual(["İstanbul'a", 'gidiyorum'])
})

test('the progress ring colors only the answers it has', () => {
  expect(progressRing(0, 0)).not.toContain('stroke-dasharray')
  expect(progressRing(2, 1).match(/stroke-dasharray/g).length).toBe(2)
  expect(progressRing(3, 0)).toContain('#3fa55a')
  expect(progressRing(3, 0)).not.toContain('#e05252')
})
