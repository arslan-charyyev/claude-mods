// Shared test data and stubs: one lesson, one cards file, and every mods API call the mod makes

export const LESSON = `# 2026-10-02 — Repeat

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

export const CARDS = {
  point: '4. Ability and inability',
  items: [
    {
      kind: 'word',
      tr: 'kira',
      en: 'rent',
      example: { tr: 'Bu ay kirayı ödeyemem.', en: "I can't pay the rent this month." },
      distractors: ['bill', 'salary', 'price'],
    },
    {
      kind: 'sentence',
      tr: 'Bu çayı içemem.',
      en: "I can't drink this tea.",
      distractors: ["I don't drink this tea.", 'I can drink this tea.', "I didn't drink this tea."],
      cloze: { text: 'Bu çayı iç___.', hint: "I can't drink this tea; it is too hot.", options: ['emem', 'mem', 'ebilirim', 'medim'], answer: 'emem', explain: '`iç-eme-m`: a limit.' },
      note: '`iç-eme-m`: a limit.',
    },
  ],
}

export const NOW = new Date(2026, 9, 2, 12, 0).getTime()

const SITE = { plugin: 'turkish-practice', viewport: { columns: 100, rows: 30 } } as const
export const BAND = { ...SITE, component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 90, scroll: { offset: 0, bodyRows: 12 }, view: {} } } as const
export const PANE = { ...SITE, component: 'Pane', requestId: 'turkish-drill', props: { title: 'Türkçe', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const

// Stub everything the mod reaches. `store` seeds the store; `clock.now` reads `time.now`,
// so a test can move time on. Returns the store and the written files for checks.
export function stubAll(on, { store = {}, cards = CARDS, time = { now: NOW } } = {}) {
  const saved = new Map<string, unknown>(Object.entries(store))
  const written = new Map<string, string>()
  on('env.get', () => ({ value: '/home/test' }))
  on('clock.now', () => ({ value: time.now }))
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('/cards') && cards !== null }))
  on('fs.list', ($, e) => ({
    value: e.path.endsWith('/cards')
      ? [{ name: '2026-10-02.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }]
      : [{ name: '2026-10-02.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }, { name: '2026-10-03.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }],
  }))
  on('fs.read', ($, e) => ({ value: e.path.endsWith('2026-10-02.md') ? LESSON : e.path.endsWith('2026-10-02.json') ? JSON.stringify(cards) : '' }))
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
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => undefined)
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { saved, written, time }
}

export const start = ($) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

// Press the option of a choice card whose text is `text`
export async function choose(ui, text) {
  for (let i = 0; i < 4; i++) {
    const b = await ui.find({ key: 'tr-option-' + i })
    if (b && b.props.label.endsWith('. ' + text)) return ui.press({ key: 'tr-option-' + i })
  }
  throw new Error('no option ' + text)
}
