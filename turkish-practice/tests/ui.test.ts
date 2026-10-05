import { expect, test } from 'claude-code/testing'
import { DAY, LEARN_STEP, NEW_PER_DAY, RETRY_STEP } from '../hooks/srs.js'
import { BAND, NOW, PANE, choose, start, stubAll } from './fixtures.ts'

const TEA = 's:bu çayı içemem'
const ROOM = 's:oda karanlık anahtarlarımı bulamıyorum'
const due = (stage) => ({ stage, box: 0, due: NOW - 1000, reps: 1, lapses: 0 })

test('a new word: the intro card, then the next new item', async ($, on) => {
  const { saved } = stubAll(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 New word · new' })).toBeDefined()
  // One flag, on the label line: the word itself has none in the band
  expect(await ui.find({ type: 'Text', text: 'kira — rent' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Bu ay kirayı ödeyemem.' })).toBeDefined()
  await ui.press({ key: 'tr-got-it' })
  expect(saved.get('srs')['w:kira']).toMatchObject({ stage: 'recognize', due: NOW + 60000 })
  expect(saved.get('daily')).toEqual({ day: '2026-10-02', newCount: 1 })
  // The intro is not an answer: today's count stays empty
  expect(saved.get('log')[0]).toMatchObject({ card: 'intro', verdict: 'seen' })
  expect(saved.get('log')[0].isRight).toBeUndefined()
  // The next card is the next new item: the tea sentence, at its cloze stage, as a sentence has no meaning card
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Fill the gap · new' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Bu çayı ＿＿＿.' })).toBeDefined()
})

test('a meaning card for a word: the right option moves it to its translate stage', async ($, on) => {
  const { saved, written } = stubAll(on, { store: { srs: { 'w:kira': due('recognize') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Four options, one word each, with no number badges
  for (let i = 0; i < 4; i++) expect((await ui.find({ key: 'tr-option-' + i })).props.hotkey).toBeUndefined()
  await choose(ui, 'rent')
  expect(await ui.find({ type: 'Text', text: '✓ Doğru! rent' })).toBeDefined()
  expect(saved.get('srs')['w:kira']).toMatchObject({ stage: 'produce', due: NOW + LEARN_STEP, reps: 2 })
  expect(saved.get('log')).toMatchObject([{ id: 'w:kira', card: 'recognize', isRight: true }])
  expect(written.get('/home/test/.claude/turkish/practice-log.json')).toContain('"card": "recognize"')
  expect(JSON.parse(written.get('/home/test/.claude/turkish/practice-state.json'))[0]).toMatchObject({ id: 'w:kira', stage: 'produce', tr: 'kira' })
})

test('a cloze card: whole words as options; a wrong word comes back soon', async ($, on) => {
  const { saved } = stubAll(on, { store: { srs: { [TEA]: due('cloze') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // The cards file cuts the gap inside the word, but the card shows whole words
  expect(await ui.find({ type: 'Text', text: 'Bu çayı ＿＿＿.' })).toBeDefined()
  await choose(ui, 'içmem')
  expect(await ui.find({ type: 'Text', text: '✗ Bu çayı içemem.' })).toBeDefined()
  expect(saved.get('srs')[TEA]).toMatchObject({ stage: 'cloze', box: 0, due: NOW + RETRY_STEP, lapses: 1 })
  expect(saved.get('log')).toMatchObject([{ card: 'cloze', answer: 'içmem', expected: 'içemem', isRight: false }])
})

test('a lesson sentence saved at the old meaning card shows its cloze from the contrast pair', async ($, on) => {
  stubAll(on, { store: { srs: { 's:bu çayı içmem': due('recognize') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: "I won't drink this tea." })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Bu çayı ＿＿＿.' })).toBeDefined()
  await choose(ui, 'içmem')
  expect(await ui.find({ type: 'Text', text: '✓ Doğru! Bu çayı içmem.' })).toBeDefined()
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
  // A lesson sentence without a cloze has only the translate card, so it stays there
  expect(saved.get('srs')[ROOM]).toMatchObject({ stage: 'produce', lapses: 1 })
})

test('an answered card moves on when Claude answers; an unanswered one stays', async ($, on) => {
  stubAll(on, { store: { srs: { [TEA]: due('recognize'), [ROOM]: { ...due('produce'), due: NOW - 500 } }, daily: { day: '2026-10-02', newCount: NEW_PER_DAY } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const turn = (id) => $.turn.complete({ turnId: id, answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', usage: null })
  await turn('t1')
  expect(await ui.find({ type: 'Text', text: 'Bu çayı ＿＿＿.' })).toBeDefined()
  await choose(ui, 'içemem')
  // A subagent's turn does not move it on
  await $.turn.complete({ turnId: 't2', answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', agentId: 'a1', usage: null })
  expect(await ui.find({ key: 'tr-next' })).toBeDefined()
  await turn('t3')
  // The next card due is a translate card: it waits for the pane
  expect(await ui.find({ type: 'Text', text: '🇹🇷 All caught up' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 translate card waits for the pane' })).toBeDefined()
})

test('the band shows no typed cards; the pane shows them', async ($, on) => {
  stubAll(on, { store: { srs: { [ROOM]: due('produce') }, daily: { day: '2026-10-02', newCount: NEW_PER_DAY } } })
  await start($)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'tr-answer' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: '1 translate card waits for the pane' })).toBeDefined()
  await band.press({ key: 'tr-open' })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ key: 'tr-answer' })).toBeDefined()
  // The band points at the pane instead of drawing the input a second time
  expect(await band.find({ type: 'Text', text: 'A translate card is open in the pane' })).toBeDefined()
  expect(await band.find({ key: 'tr-answer' })).toBeUndefined()
})

test('skip and open are small text buttons; done for the day shows the next review', async ($, on) => {
  const { time } = stubAll(on, { store: { srs: { [TEA]: { ...due('recognize'), due: NOW + 2 * 3600 * 1000 } }, daily: { day: '2026-10-02', newCount: NEW_PER_DAY } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 All caught up' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Next review in 2 h' })).toBeDefined()
  expect((await ui.find({ key: 'tr-open' })).props).toMatchObject({ label: '⤢ Open', plain: true })
  await ui.press({ key: 'tr-more' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Fill the gap' })).toBeDefined()
  expect((await ui.find({ key: 'tr-skip' })).props).toMatchObject({ label: '⏭ Skip', plain: true })
  await ui.press({ key: 'tr-skip' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 All caught up' })).toBeDefined()
  time.now = NOW
})

test('the band folds to one line and back, and remembers it', async ($, on) => {
  const { saved } = stubAll(on, { store: { srs: { [TEA]: due('cloze') } } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'tr-collapse' })
  expect(saved.get('bandCollapsed')).toBe(true)
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Fill the gap' })).toBeDefined()
  expect(await ui.find({ key: 'tr-option-0' })).toBeUndefined()
  expect((await ui.find({ key: 'tr-expand' })).props).toMatchObject({ label: '▴ Show', plain: true })
  expect(await ui.find({ key: 'tr-open' })).toBeDefined()
  await ui.press({ key: 'tr-expand' })
  expect(saved.get('bandCollapsed')).toBe(false)
  expect(await ui.find({ key: 'tr-option-0' })).toBeDefined()
})

test('a folded band stays folded in a new session', async ($, on) => {
  stubAll(on, { store: { srs: { [TEA]: due('cloze') }, bandCollapsed: true } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'tr-expand' })).toBeDefined()
  expect(await ui.find({ key: 'tr-option-0' })).toBeUndefined()
})

test('the prototype review list becomes due translate cards', async ($, on) => {
  const { saved } = stubAll(on, { store: { missed: [{ en: 'x', tr: 'Oda karanlık, anahtarlarımı bulamıyorum.', note: '', kind: 'drill', date: '2026-10-02' }] } })
  await start($)
  expect(saved.get('missed')).toEqual([])
  expect(saved.get('srs')[ROOM]).toMatchObject({ stage: 'produce', due: NOW, lapses: 1 })
  await $.command.run({ command: 'tr', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tr-prompt' })).props.text).toBe("### The room is dark; I can't find my keys.")
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
