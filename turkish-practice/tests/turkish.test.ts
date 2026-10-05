import { expect, test } from 'claude-code/testing'
import { grade, parseLesson, splitNote } from '../hooks/lesson.js'
import { answerCard, escapeXml, progressRing } from '../hooks/svg.js'

const LESSON = `# 2026-10-02 — Repeat

## Five examples

1. **Sabahları kahve içmem, çay içerim.** — I don't drink coffee in the mornings; I drink tea.
   gloss line
2. **Otobüs çok dolu, binemiyoruz.** — The bus is very full; we can't get on.

## The contrast

- **Bu çayı içmem.** — I won't drink this tea.
- **Bu çayı içemem.** — I can't drink this tea.

## Production drill

1. The room is dark; I can't find my keys.

## Answers

Drill:

1. Oda karanlık, anahtarlarımı bulamıyorum. (\`bul-amı-yor-um\`: a limit.)

Review:

1. Marketten

## Sentence of the day

> 🇹🇷 **Market kapalı, bu akşam ekmek alamam.** — *The shop is closed; I can't buy bread this evening.*
`

const SITE = { plugin: 'turkish-practice', viewport: { columns: 100, rows: 30 } } as const
const BAND = { ...SITE, component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 90, scroll: { offset: 0, bodyRows: 6 }, view: {} } } as const
const PANE = { ...SITE, component: 'Pane', requestId: 'turkish-drill', props: { title: 'Türkçe', isFocused: true, bodyColumns: 90, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

// Stub everything the mod reaches, and return the store and written files for checks
function stubAll(on) {
  const saved = new Map<string, unknown>()
  const written = new Map<string, string>()
  on('env.get', () => ({ value: '/home/test' }))
  on('clock.now', () => ({ value: new Date(2026, 9, 2, 12, 0).getTime() }))
  on('fs.list', () => ({ value: [{ name: '2026-10-02.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }, { name: '2026-10-03.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }))
  on('fs.read', ($, e) => ({ value: e.path.endsWith('2026-10-02.md') ? LESSON : '' }))
  on('fs.write', ($, e) => {
    written.set(e.path, e.text)
    return { value: undefined }
  })
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { saved, written }
}

const start = ($) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

test('the parser reads examples, contrast, drill answers, and the sentence of the day', () => {
  const l = parseLesson(LESSON, '2026-10-02')
  expect(l.sentences.map((s) => s.kind)).toEqual(['example', 'example', 'contrast', 'contrast', 'sotd'])
  expect(l.drill).toEqual([{ en: "The room is dark; I can't find my keys.", tr: 'Oda karanlık, anahtarlarımı bulamıyorum.', note: '`bul-amı-yor-um`: a limit.', kind: 'drill', date: '2026-10-02' }])
  expect(splitNote('Pencereyi açabilir miyim?')).toEqual({ tr: 'Pencereyi açabilir miyim?', note: '' })
  expect(splitNote('**Bu ay kirayı ödeyemem.** (`kira-yı`: the accusative.)')).toEqual({ tr: 'Bu ay kirayı ödeyemem.', note: '`kira-yı`: the accusative.' })
  expect(splitNote('**Anahtarı evde bulamıyorum.**')).toEqual({ tr: 'Anahtarı evde bulamıyorum.', note: '' })
})

test('grading tells a missing Turkish letter from a wrong word', () => {
  expect(grade('Oda karanlık, anahtarlarımı bulamıyorum', 'Oda karanlık, anahtarlarımı bulamıyorum.').verdict).toBe('exact')
  expect(grade('oda karanlik anahtarlarimi bulamiyorum', 'Oda karanlık, anahtarlarımı bulamıyorum.').verdict).toBe('letters')
  const g = grade('Oda karanlık, anahtarlarımı bulmuyorum', 'Oda karanlık, anahtarlarımı bulamıyorum.')
  expect(g.verdict).toBe('different')
  expect(g.words.map((w) => w.status)).toEqual(['ok', 'ok', 'ok', 'missing'])
  expect(g.words[0].word).toBe('Oda')
  // Turkish casing: the capital I is the dotless ı
  expect(grade('ILIK', 'ılık').verdict).toBe('exact')
  // The chips keep the expected spelling, and an apostrophe keeps a word whole
  const p = grade("istanbula gidiyorum", "İstanbul'a gidiyorum.")
  expect(p.verdict).toBe('exact')
  expect(p.words.map((w) => w.word)).toEqual(["İstanbul'a", 'gidiyorum'])
})

test('a main-session answer gets a Turkish line, a subagent answer does not', async ($, on) => {
  stubAll(on)
  await start($)
  const main = await $.turn.complete({ turnId: 't1', answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', usage: null })
  expect(main.text).toMatch(/^🇹🇷 [^()]+$/)
  const sub = await $.turn.complete({ turnId: 't2', answer: 'Done.', durationMs: 5, isAborted: false, reason: 'answer', agentId: 'a1', usage: null })
  expect(sub.text).toBe('Done.')
  const aborted = await $.turn.complete({ turnId: 't3', answer: 'Do', durationMs: 5, isAborted: true, reason: 'aborted', usage: null })
  expect(aborted.text).toBe('Do')
})

test('the band shows the sentence of the day and reveals its meaning on 1', async ($, on) => {
  stubAll(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Market kapalı, bu akşam ekmek alamam.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /The shop is closed/ })).toBeUndefined()
  await ui.press({ key: 'tr-meaning' })
  expect(await ui.find({ type: 'Text', text: /The shop is closed/ })).toBeDefined()
  expect((await ui.find({ key: 'tr-meaning' })).props.label).toBe('Hide meaning')
  // Next shows another sentence, with its meaning hidden again
  await ui.press({ key: 'tr-next-line' })
  expect(await ui.find({ type: 'Text', text: '🇹🇷 Market kapalı, bu akşam ekmek alamam.' })).toBeUndefined()
  expect((await ui.find({ key: 'tr-meaning' })).props.label).toBe('Meaning')
})

test('the terminal gets nothing from the mod', async ($, on) => {
  stubAll(on)
  await start($)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await band.find({ key: 'tr-meaning' })).toBeUndefined()
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ key: 'tr-answer' })).toBeUndefined()
})

test('a right drill answer is saved to the store and the practice log', async ($, on) => {
  const { saved, written } = stubAll(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tr-prompt' })).props.text).toBe("### The room is dark; I can't find my keys.")
  await ui.input({ key: 'tr-answer', text: 'oda karanlik anahtarlarimi bulamiyorum' })
  const card = (await ui.find({ key: 'tr-card' })).children[0]
  expect(card.props.alt).toBe('Expected: Oda karanlık, anahtarlarımı bulamıyorum.')
  expect(card.props.source).toContain('check the Turkish letters')
  expect((await ui.find({ key: 'tr-expected' })).props.text).toContain('`bul-amı-yor-um`')
  const log = saved.get('log') as Array<{ verdict: string; day: string }>
  expect(log.map((x) => x.verdict)).toEqual(['letters'])
  expect(log[0].day).toBe('2026-10-02')
  expect(written.get('/home/test/.claude/turkish/practice-log.json')).toContain('"verdict": "letters"')
  await ui.press({ key: 'tr-next' })
  expect(await ui.find({ type: 'Input', key: 'tr-answer' })).toBeDefined()
})

test('a different answer waits for the self-check, and a wrong one goes to review', async ($, on) => {
  const { saved } = stubAll(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'tr-answer', text: 'Oda karanlık, anahtarlarımı bulmuyorum.' })
  expect(saved.get('log')).toBeUndefined()
  await ui.press({ key: 'tr-wrong' })
  expect((saved.get('log') as Array<{ verdict: string }>).map((x) => x.verdict)).toEqual(['wrong'])
  expect((saved.get('missed') as Array<{ tr: string }>).map((x) => x.tr)).toEqual(['Oda karanlık, anahtarlarımı bulamıyorum.'])
  expect(await ui.find({ type: 'Text', text: '✓ 0   ✗ 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 to review' })).toBeDefined()
})

test('the lesson tab hides the answers until a press', async ($, on) => {
  stubAll(on)
  await start($)
  await $.command.run({ command: 'tr', args: 'lesson' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const lesson = await ui.find({ key: 'tr-lesson' })
  expect(lesson.props.text).not.toContain('## Answers')
  expect(await ui.find({ key: 'tr-lesson-answers' })).toBeUndefined()
  await ui.press({ key: 'tr-answers' })
  expect((await ui.find({ key: 'tr-lesson-answers' })).props.text).toContain('Oda karanlık')
})

test('the SVG builders escape text and color the chips by match', () => {
  expect(escapeXml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;')
  const svg = answerCard({ verdict: 'different', words: [{ word: 'oda', status: 'ok' }, { word: '<x>', status: 'missing' }], hasAnswer: true })
  expect(svg).toMatch(/^<svg [^>]*width="520"/)
  expect(svg).toContain('&lt;x&gt;')
  expect(svg).toContain('#3fa55a')
  expect(svg).toContain('#e05252')
  // Before the first answer the ring has no colored arcs
  expect(progressRing(0, 0)).not.toContain('stroke-dasharray')
  expect(progressRing(2, 1).match(/stroke-dasharray/g).length).toBe(2)
})
