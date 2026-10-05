import { expect, test } from 'claude-code/testing'
import { DAY, LEARN_STEP, NEW_PER_DAY, RETRY_STEP } from '../hooks/srs.js'
import { BAND, NOW, PANE, choose, start, stubAll } from './fixtures.ts'

const TEA = 's:bu çayı içemem'
const ROOM = 's:oda karanlık anahtarlarımı bulamıyorum'
const due = (stage) => ({ stage, box: 0, due: NOW - 1000, reps: 1, lapses: 0 })

test('a new word: the intro card, then its meaning card', async ($, on) => {
  const { saved } = stubAll(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 New word · new' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '🇹🇷 kira — rent' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Bu ay kirayı ödeyemem.' })).toBeDefined()
  await ui.press({ key: 'tr-got-it' })
  expect(saved.get('srs')['w:kira']).toMatchObject({ stage: 'recognize', due: NOW + 60000 })
  expect(saved.get('daily')).toEqual({ day: '2026-10-02', newCount: 1 })
  // The intro is not an answer: today's count stays empty
  expect(saved.get('log')[0]).toMatchObject({ card: 'intro', verdict: 'seen' })
  expect(saved.get('log')[0].isRight).toBeUndefined()
  // The next card is the next new item: the tea sentence, at its meaning stage
  expect(await ui.find({ type: 'Text', text: '🇹🇷 What does it mean? · new' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Bu çayı içemem.' })).toBeDefined()
})

test('a meaning card: the right option moves the item to its cloze stage', async ($, on) => {
  const { saved, written } = stubAll(on, { store: { srs: { [TEA]: due('recognize') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Four options, with no number badges
  for (let i = 0; i < 4; i++) expect((await ui.find({ key: 'tr-option-' + i })).props.hotkey).toBeUndefined()
  await choose(ui, "I can't drink this tea.")
  expect(await ui.find({ type: 'Text', text: "✓ Doğru! I can't drink this tea." })).toBeDefined()
  expect(saved.get('srs')[TEA]).toMatchObject({ stage: 'cloze', due: NOW + LEARN_STEP, reps: 2 })
  expect(saved.get('log')).toMatchObject([{ id: TEA, card: 'recognize', isRight: true }])
  expect(written.get('/home/test/.claude/turkish/practice-log.json')).toContain('"card": "recognize"')
  expect(JSON.parse(written.get('/home/test/.claude/turkish/practice-state.json'))[0]).toMatchObject({ id: TEA, stage: 'cloze', tr: 'Bu çayı içemem.' })
})

test('a cloze card: a wrong form steps back and comes back soon', async ($, on) => {
  const { saved } = stubAll(on, { store: { srs: { [TEA]: due('cloze') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Bu çayı iç ＿＿＿ .' })).toBeDefined()
  await choose(ui, 'mem')
  expect(await ui.find({ type: 'Text', text: '✗ Bu çayı içemem.' })).toBeDefined()
  expect(saved.get('srs')[TEA]).toMatchObject({ stage: 'recognize', box: 0, due: NOW + RETRY_STEP, lapses: 1 })
  expect(saved.get('log')).toMatchObject([{ card: 'cloze', answer: 'mem', expected: 'emem', isRight: false }])
})

test('a translate card in the pane: missing Turkish letters still count as right', async ($, on) => {
  const { saved } = stubAll(on, { store: { srs: { [ROOM]: due('produce') } } })
  await start($)
  await $.command.run({ command: 'tr', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tr-prompt' })).props.text).toBe("### The room is dark; I can't find my keys.")
  await ui.input({ key: 'tr-answer', text: 'oda karanlik anahtarlarimi bulamiyorum' })
  expect(await ui.find({ type: 'Text', text: /^≈ Right/ })).toBeDefined()
  // The answer once, as written, with the words that lack their letters in amber
  expect(await ui.find({ type: 'Text', text: 'karanlık,' })).toMatchObject({ props: { color: '#c9962a' } })
  expect(await ui.find({ type: 'Text', text: 'Oda' })).toMatchObject({ props: { bold: true } })
  expect(saved.get('srs')[ROOM]).toMatchObject({ stage: 'produce', box: 1, due: NOW + DAY })
  expect(await ui.find({ type: 'Text', text: '1 learning · 0 known' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '0 learning · 1 known' })).toBeDefined()
})

test('a different translation waits for the self-check', async ($, on) => {
  const { saved } = stubAll(on, { store: { srs: { [ROOM]: due('produce') } } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'tr-answer', text: 'Oda karanlık, anahtarlarımı bulmuyorum.' })
  expect(saved.get('log')).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'bulamıyorum.' })).toMatchObject({ props: { color: '#e05252' } })
  await ui.press({ key: 'tr-wrong' })
  expect(saved.get('log')).toMatchObject([{ card: 'produce', verdict: 'wrong', isRight: false }])
  // A lesson sentence has no cloze, so it steps back to its meaning card
  expect(saved.get('srs')[ROOM]).toMatchObject({ stage: 'recognize', lapses: 1 })
})

test('an answered card moves on when Claude answers; an unanswered one stays', async ($, on) => {
  stubAll(on, { store: { srs: { [TEA]: due('recognize'), [ROOM]: { ...due('produce'), due: NOW - 500 } } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const turn = (id) => $.turn.complete({ turnId: id, answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', usage: null })
  await turn('t1')
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Bu çayı içemem.' })).toBeDefined()
  await choose(ui, "I can't drink this tea.")
  // A subagent's turn does not move it on
  await $.turn.complete({ turnId: 't2', answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', agentId: 'a1', usage: null })
  expect(await ui.find({ key: 'tr-next' })).toBeDefined()
  await turn('t3')
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Translate into Turkish' })).toBeDefined()
})

test('skip and open are icon buttons; done for the day shows the next review', async ($, on) => {
  const { time } = stubAll(on, { store: { srs: { [TEA]: { ...due('produce'), due: NOW + 2 * 3600 * 1000 } }, daily: { day: '2026-10-02', newCount: NEW_PER_DAY } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 All caught up' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Next review in 2 h' })).toBeDefined()
  expect((await ui.find({ key: 'tr-open' })).props).toMatchObject({ label: '⤢', plain: true })
  await ui.press({ key: 'tr-more' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Translate into Turkish' })).toBeDefined()
  expect((await ui.find({ key: 'tr-skip' })).props).toMatchObject({ label: '⏭', plain: true })
  await ui.press({ key: 'tr-skip' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 All caught up' })).toBeDefined()
  time.now = NOW
})

test('the prototype review list becomes due translate cards', async ($, on) => {
  const { saved } = stubAll(on, { store: { missed: [{ en: 'x', tr: 'Oda karanlık, anahtarlarımı bulamıyorum.', note: '', kind: 'drill', date: '2026-10-02' }] } })
  await start($)
  expect(saved.get('missed')).toEqual([])
  expect(saved.get('srs')[ROOM]).toMatchObject({ stage: 'produce', due: NOW, lapses: 1 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: "The room is dark; I can't find my keys." })).toBeDefined()
})

test('the lesson tab hides the answers until a press', async ($, on) => {
  stubAll(on)
  await start($)
  await $.command.run({ command: 'tr', args: 'lesson' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tr-lesson' })).props.text).not.toContain('## Answers')
  expect(await ui.find({ key: 'tr-lesson-answers' })).toBeUndefined()
  await ui.press({ key: 'tr-answers' })
  expect((await ui.find({ key: 'tr-lesson-answers' })).props.text).toContain('Oda karanlık')
})

test('the terminal gets nothing from the mod', async ($, on) => {
  stubAll(on)
  await start($)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await band.find({ key: 'tr-got-it' })).toBeUndefined()
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ key: 'tr-got-it' })).toBeUndefined()
})
