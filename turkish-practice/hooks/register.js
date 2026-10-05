// turkish-practice: Turkish practice drawn from the daily lesson files, for the Desktop app.
// - A Turkish line under each answer of the main session
// - A band above the prompt: the line, its meaning on 1, the drill on 2
// - /tr: a pane with a translation drill and today's lesson
import { parseLesson, lessonBody, grade, localDate, shuffle } from './lesson.js'
import { answerCard, progressRing } from './svg.js'

const PANE = 'turkish-drill'
// How many recent lesson files feed the line and the drill
const LOOKBACK = 7
// How many drill results the store keeps
const LOG_LIMIT = 500

let base = ''
let loadedDate = ''
let lessons = []
let todayMd = ''

// The line under each answer
let linePool = []
const shownLines = new Set()
let current = null
let isRevealed = false

// The drill pane
let tab = 'drill'
let isAnswersShown = false
let drillQueue = []
let drillItem = null
let drillResult = null
const doneDrill = new Set()
let missed = []
let todayStats = { right: 0, wrong: 0 }

// Read the newest lesson files up to today, and build the pools from them
async function load($) {
  const home = await $.env.get('HOME')
  base = home + '/.claude/turkish'
  const today = localDate(await $.clock.now())
  const entries = await $.fs.list(base + '/lessons')
  const names = entries
    .filter((x) => x.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/.test(x.name) && x.name.slice(0, 10) <= today)
    .map((x) => x.name)
    .sort()
    .reverse()
    .slice(0, LOOKBACK)

  const parsed = []
  for (const name of names) {
    const md = await $.fs.read(base + '/lessons/' + name)
    if (parsed.length === 0) todayMd = md
    parsed.push(parseLesson(md, name.slice(0, 10)))
  }
  lessons = parsed
  loadedDate = today
  linePool = []

  const savedMissed = await $.store.get('missed')
  missed = Array.isArray(savedMissed) ? savedMissed : []
  const log = await $.store.get('log')
  todayStats = statsFor(Array.isArray(log) ? log : [], today)

  drillQueue = buildDrillQueue()
  drillItem = drillQueue.shift() ?? null
  drillResult = null

  // Until the first answer, the band shows the sentence of the day
  if (!current && lessons[0]) {
    current = lessons[0].sentences.find((s) => s.kind === 'sotd') ?? lessons[0].sentences[0] ?? null
    if (current) shownLines.add(current.tr)
  }
}

// Load again when the date changes in a long session
async function ensureFresh($) {
  if (localDate(await $.clock.now()) !== loadedDate) await load($)
}

function statsFor(log, day) {
  const todays = log.filter((x) => x.day === day)
  return {
    right: todays.filter((x) => x.verdict === 'exact' || x.verdict === 'letters' || x.verdict === 'variant').length,
    wrong: todays.filter((x) => x.verdict === 'wrong' || x.verdict === 'skipped').length,
  }
}

// Today's sentences first, then the older ones, each group shuffled, none shown twice in a session
function nextLine() {
  if (linePool.length === 0) {
    const [today, ...older] = lessons
    const all = [...shuffle(today?.sentences ?? []), ...shuffle(older.flatMap((l) => l.sentences))]
    linePool = all.filter((s) => !shownLines.has(s.tr))
    if (linePool.length === 0) {
      shownLines.clear()
      linePool = all
    }
  }
  const s = linePool.shift() ?? null
  if (s) shownLines.add(s.tr)
  return s
}

// Missed items first, then today's drill and examples, then the older ones
function buildDrillQueue() {
  const [today, ...older] = lessons
  const asDrill = (s) => ({ en: s.en, tr: s.tr, note: '', kind: s.kind, date: s.date })
  const candidates = [
    ...missed,
    ...(today?.drill ?? []),
    ...shuffle((today?.sentences ?? []).filter((s) => s.kind === 'example').map(asDrill)),
    ...shuffle(older.flatMap((l) => l.drill)),
    ...shuffle(older.flatMap((l) => l.sentences.filter((s) => s.kind === 'example').map(asDrill))),
  ]
  const seen = new Set()
  return candidates.filter((x) => {
    if (seen.has(x.tr) || doneDrill.has(x.tr)) return false
    seen.add(x.tr)
    return true
  })
}

function nextDrill() {
  if (drillQueue.length === 0) drillQueue = buildDrillQueue()
  drillItem = drillQueue.shift() ?? null
  drillResult = null
}

// Save one result: the store keeps the log and the missed list, and
// practice-log.json beside the lessons gives the daily lesson agent the same log
async function record($, item, answer, verdict) {
  const day = localDate(await $.clock.now())
  doneDrill.add(item.tr)
  const entry = { at: new Date(await $.clock.now()).toISOString(), day, lesson: item.date, kind: item.kind, en: item.en, expected: item.tr, answer, verdict }

  // Read again right before the write, because other sessions share the store
  const savedLog = await $.store.get('log')
  const log = [...(Array.isArray(savedLog) ? savedLog : []), entry].slice(-LOG_LIMIT)
  await $.store.set('log', log)

  const savedMissed = await $.store.get('missed')
  const others = (Array.isArray(savedMissed) ? savedMissed : []).filter((x) => x.tr !== item.tr)
  const isWrong = verdict === 'wrong' || verdict === 'skipped'
  missed = isWrong ? [...others, { en: item.en, tr: item.tr, note: item.note, kind: item.kind, date: item.date }] : others
  await $.store.set('missed', missed)

  todayStats = statsFor(log, day)
  await $.fs.write(base + '/practice-log.json', JSON.stringify(log, null, 2) + '\n')
}

async function openPane($) {
  await $.ui.open({ id: PANE, title: 'Türkçe', focus: true, closeOnEscape: true })
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await load($)
    } catch (error) {
      $.ui.log('could not read the lessons: ' + error.message)
    }
    await $.command.register({
      name: 'tr',
      description: 'Turkish practice: a translation drill and today\'s lesson',
      argumentHint: '[lesson]',
      immediate: true,
    })
    return next(e)
  })

  // A Turkish line under each answer of the main session, in the Desktop app only.
  // A subagent's turn, an interrupted turn, and a session without the app get no line.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer' || !e.answer) return result
    const surfaces = await $.session.surfaces()
    if (!surfaces.includes('desktop')) return result
    await ensureFresh($)
    const s = nextLine()
    if (!s) return result
    current = s
    isRevealed = false
    $.ui.invalidate('ui.render')
    return { ...result, text: '🇹🇷 ' + s.tr }
  })

  on('command.run', { command: 'tr' }, async ($, e) => {
    await ensureFresh($)
    tab = e.args.trim() === 'lesson' ? 'lesson' : 'drill'
    await openPane($)
    $.ui.invalidate('ui.render')
    return {}
  })

  // The band above the prompt: the current sentence, its meaning on demand, and the drill
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (!current || e.surface !== 'desktop') return theirs
    const { Box, Text, Button } = $.ui.resolve(e)
    const sentence = Box({
      flexDirection: 'column',
      flexGrow: 1,
      flexShrink: 1,
      children: [
        Text({ bold: true, wrap: 'wrap', children: ['🇹🇷 ' + current.tr] }),
        ...(isRevealed ? [Text({ italic: true, dimColor: true, wrap: 'wrap', children: [current.en] })] : []),
      ],
    })
    const band = Box({
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: 2,
      children: [
        sentence,
        Button({
          key: 'tr-meaning',
          label: isRevealed ? 'Hide meaning' : 'Meaning',
          hotkey: '1',
          variant: 'secondary',
          onPress: () => {
            isRevealed = !isRevealed
            $.ui.invalidate('ui.render')
          },
        }),
        Button({
          key: 'tr-next-line',
          label: 'Next',
          hotkey: '3',
          variant: 'secondary',
          onPress: () => {
            const s = nextLine()
            if (s) current = s
            isRevealed = false
            $.ui.invalidate('ui.render')
          },
        }),
        Button({
          key: 'tr-drill',
          label: 'Drill',
          hotkey: '2',
          variant: 'secondary',
          onPress: async () => {
            tab = 'drill'
            await openPane($)
            $.ui.invalidate('ui.render')
          },
        }),
      ],
    })
    return theirs ? Box({ flexDirection: 'column', rowGap: 1, children: [band, theirs] }) : band
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE || e.surface !== 'desktop') return next(e)
    const { Box, Text, Button, Input, Markdown, Svg } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    const tabButton = (name, label) =>
      Button({
        key: 'tr-tab-' + name,
        label,
        variant: tab === name ? 'primary' : 'secondary',
        onPress: () => {
          tab = name
          redraw()
        },
      })

    const answered = todayStats.right + todayStats.wrong
    const header = Box({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      children: [
        Box({ flexDirection: 'row', columnGap: 1, children: [tabButton('drill', 'Drill'), tabButton('lesson', 'Lesson')] }),
        Box({
          flexDirection: 'row',
          alignItems: 'center',
          columnGap: 1,
          children: [
            Svg({
              source: progressRing(todayStats.right, todayStats.wrong),
              alt: 'Today: ' + todayStats.right + ' right, ' + todayStats.wrong + ' wrong',
              width: 44,
              height: 44,
            }),
            Box({
              flexDirection: 'column',
              children: [
                Text({ dimColor: true, children: [answered === 0 ? 'No answers today' : '✓ ' + todayStats.right + '   ✗ ' + todayStats.wrong] }),
                Text({ dimColor: true, children: [missed.length + ' to review'] }),
              ],
            }),
          ],
        }),
      ],
    })

    let body
    if (tab === 'lesson') {
      const i = todayMd.search(/^## Answers/m)
      const answers = i === -1 ? '' : todayMd.slice(i)
      body = [
        Markdown({ key: 'tr-lesson', text: (lessonBody(todayMd) || 'No lesson file found.').slice(0, 10000) }),
        ...(answers
          ? [
              Box({
                flexDirection: 'row',
                children: [
                  Button({
                    key: 'tr-answers',
                    label: isAnswersShown ? 'Hide answers' : 'Show answers',
                    variant: 'secondary',
                    onPress: () => {
                      isAnswersShown = !isAnswersShown
                      redraw()
                    },
                  }),
                ],
              }),
            ]
          : []),
        ...(isAnswersShown && answers ? [Markdown({ key: 'tr-lesson-answers', text: answers.slice(0, 10000) })] : []),
      ]
    } else if (!drillItem) {
      body = [Text({ children: ['No drill items. The mod reads the lessons in ' + base + '/lessons.'] })]
    } else {
      const item = drillItem
      const prompt = [
        Text({ dimColor: true, children: ['From the ' + item.date + ' lesson · ' + item.kind] }),
        Markdown({ key: 'tr-prompt', text: '### ' + item.en }),
      ]
      if (!drillResult) {
        body = [
          ...prompt,
          Input({
            key: 'tr-answer',
            label: 'Türkçe',
            placeholder: 'Type the Turkish sentence',
            value: '',
            submitLabel: 'Check',
            autoFocus: true,
            onSubmit: async (value) => {
              if (!value.trim()) return
              const g = grade(value, item.tr)
              drillResult = { answer: value.trim(), ...g }
              redraw()
              // A clear result is saved now; a different answer waits for the self-check
              if (g.verdict !== 'different') await record($, item, value.trim(), g.verdict)
            },
          }),
          Box({
            flexDirection: 'row',
            children: [
              Button({
                key: 'tr-show',
                label: 'Show the answer',
                variant: 'secondary',
                onPress: async () => {
                  drillResult = { answer: '', verdict: 'skipped', words: grade('', item.tr).words }
                  redraw()
                  await record($, item, '', 'skipped')
                },
              }),
            ],
          }),
        ]
      } else {
        const r = drillResult
        const goNext = () => {
          nextDrill()
          redraw()
        }
        const selfCheck = async (verdict) => {
          drillResult = { ...r, verdict }
          redraw()
          await record($, item, r.answer, verdict)
        }
        const actions =
          r.verdict === 'different'
            ? [
                Button({ key: 'tr-variant', label: 'Mine is right too', hotkey: 'y', variant: 'secondary', onPress: () => selfCheck('variant') }),
                Button({ key: 'tr-wrong', label: 'Mine is wrong', hotkey: 'w', variant: 'primary', autoFocus: true, onPress: () => selfCheck('wrong') }),
              ]
            : [Button({ key: 'tr-next', label: 'Next', hotkey: 'n', variant: 'primary', autoFocus: true, onPress: goNext })]
        body = [
          ...prompt,
          ...(r.answer ? [Text({ dimColor: true, wrap: 'wrap', children: ['You wrote: ' + r.answer] })] : []),
          Box({
            key: 'tr-card',
            children: [
              Svg({
                source: answerCard({ verdict: r.verdict, words: r.words, hasAnswer: !!r.answer }),
                alt: 'Expected: ' + item.tr,
              }),
            ],
          }),
          Markdown({ key: 'tr-expected', text: '**' + item.tr + '**' + (item.note ? '\n\n' + item.note : '') }),
          Box({ flexDirection: 'row', columnGap: 1, children: actions }),
        ]
      }
    }

    return Box({ flexDirection: 'column', rowGap: 1, padding: 1, children: [header, ...body] })
  })
}
