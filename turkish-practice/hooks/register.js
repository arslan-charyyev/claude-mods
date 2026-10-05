// turkish-practice: Turkish flashcards with spaced repetition, for the Desktop Code tab.
// - The band above the prompt shows the card that is due; an answered card
//   moves on when Claude's next answer ends, or on Next
// - /tr opens a pane to study card after card, and today's lesson
// The learning data lives in ~/.claude/turkish: the lessons and cards the daily
// lesson job writes, and the practice log and state this mod writes back.
import { parseLesson, lessonBody, grade, localDate, shuffle } from './lesson.js'
import { progressRing } from './svg.js'
import { itemsFromLessons, itemsFromCards, mergeItems, pickCard, nextDue, answer, summary, itemId, NEW_PER_DAY, DAY } from './srs.js'

const PANE = 'turkish-drill'
// New items come only from the lessons and cards of this many recent days
const NEW_LOOKBACK = 7
const LOG_LIMIT = 2000
const RIGHT = '#3fa55a'
const WRONG = '#e05252'
const AMBER = '#c9962a'
const LETTERS = ['A', 'B', 'C', 'D']

let base = ''
let loadedDate = ''
let todayMd = ''
let items = []
let recentDates = new Set()
let srs = {}
let newToday = 0
let dayStats = { right: 0, wrong: 0 }
const skipped = new Set()

// The card on show, shared by the band and the pane:
// { item, stage, isNew, options?, result? }
let card = null
let tab = 'study'
let isAnswersShown = false

async function load($) {
  const home = await $.env.get('HOME')
  base = home + '/.claude/turkish'
  const now = await $.clock.now()
  const today = localDate(now)

  const lessonNames = (await $.fs.list(base + '/lessons'))
    .filter((x) => x.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/.test(x.name) && x.name.slice(0, 10) <= today)
    .map((x) => x.name)
    .sort()
  const lessons = []
  for (const name of lessonNames) lessons.push(parseLesson(await $.fs.read(base + '/lessons/' + name), name.slice(0, 10)))
  todayMd = lessonNames.length > 0 ? await $.fs.read(base + '/lessons/' + lessonNames[lessonNames.length - 1]) : ''

  const cardFiles = []
  if (await $.fs.exists(base + '/cards')) {
    const cardNames = (await $.fs.list(base + '/cards'))
      .filter((x) => x.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(x.name) && x.name.slice(0, 10) <= today)
      .map((x) => x.name)
    for (const name of cardNames) {
      try {
        cardFiles.push({ ...JSON.parse(await $.fs.read(base + '/cards/' + name)), date: name.slice(0, 10) })
      } catch (error) {
        $.ui.log('skipped cards/' + name + ': ' + error.message)
      }
    }
  }

  items = mergeItems(itemsFromLessons(lessons), itemsFromCards(cardFiles))
  const dates = [...new Set([...lessonNames.map((n) => n.slice(0, 10)), ...cardFiles.map((f) => f.date)])].sort()
  recentDates = new Set(dates.slice(-NEW_LOOKBACK))

  const saved = await $.store.get('srs')
  srs = saved && typeof saved === 'object' ? saved : {}
  // The prototype kept missed drill items in a list: they start as due translate cards
  const missed = await $.store.get('missed')
  if (Array.isArray(missed) && missed.length > 0) {
    for (const m of missed) {
      const id = itemId('sentence', m.tr)
      if (!srs[id]) srs[id] = { stage: 'produce', box: 0, due: now, reps: 0, lapses: 1 }
    }
    await $.store.set('srs', srs)
    await $.store.set('missed', [])
  }

  const daily = await $.store.get('daily')
  newToday = daily && daily.day === today ? daily.newCount : 0
  const log = await $.store.get('log')
  dayStats = statsFor(Array.isArray(log) ? log : [], today)
  loadedDate = today
  card = null
  skipped.clear()
  pickNext(now)
}

async function ensureFresh($) {
  if (localDate(await $.clock.now()) !== loadedDate) await load($)
}

function statsFor(log, day) {
  const todays = log.filter((x) => x.day === day && typeof x.isRight === 'boolean')
  return { right: todays.filter((x) => x.isRight).length, wrong: todays.filter((x) => !x.isRight).length }
}

// Show a card: the options of a choice card are shuffled once, when it is shown
function show(pick) {
  if (!pick) {
    card = null
    return
  }
  const { item } = pick
  let stage = pick.stage
  // A sentence without any wrong option cannot be a choice card
  if (stage === 'recognize' && item.distractors.length === 0) stage = 'produce'
  const options =
    stage === 'recognize' ? shuffle([item.en, ...item.distractors]) : stage === 'cloze' ? shuffle(item.cloze.options) : undefined
  card = { item, stage, isNew: pick.isNew, options }
}

function pickNext(now) {
  const open = items.filter((it) => !skipped.has(it.id))
  show(pickCard(open, srs, now, newToday, (it) => recentDates.has(it.date)))
}

// Practice ahead: the item that comes due next, at its own stage
function practiceMore() {
  const it = nextDue(items.filter((x) => !skipped.has(x.id)), srs)
  if (it) show({ item: it, stage: srs[it.id].stage, isNew: false })
}

// Save one answer: the item's new state, today's new-item count, and the log.
// The store is read again right before each write, because other sessions share it.
async function record($, c, isRight, given, verdict) {
  const now = await $.clock.now()
  const day = localDate(now)
  const savedSrs = await $.store.get('srs')
  const all = savedSrs && typeof savedSrs === 'object' ? savedSrs : {}
  all[c.item.id] = answer(c.item, all[c.item.id], c.stage, isRight, now)
  srs = all
  await $.store.set('srs', all)

  if (c.isNew) {
    const daily = await $.store.get('daily')
    newToday = (daily && daily.day === day ? daily.newCount : 0) + 1
    await $.store.set('daily', { day, newCount: newToday })
  }

  const entry = {
    at: new Date(now).toISOString(),
    day,
    id: c.item.id,
    kind: c.item.kind,
    card: c.stage,
    lesson: c.item.date,
    en: c.item.en,
    expected: c.stage === 'cloze' ? c.item.cloze.answer : c.stage === 'recognize' ? c.item.en : c.item.tr,
    answer: given,
    verdict,
    ...(c.stage === 'intro' ? {} : { isRight }),
  }
  const savedLog = await $.store.get('log')
  const log = [...(Array.isArray(savedLog) ? savedLog : []), entry].slice(-LOG_LIMIT)
  await $.store.set('log', log)
  dayStats = statsFor(log, day)

  // Files beside the lessons, for the daily lesson job
  await $.fs.write(base + '/practice-log.json', JSON.stringify(log, null, 2) + '\n')
  const state = items
    .filter((it) => all[it.id])
    .map((it) => ({ id: it.id, kind: it.kind, tr: it.tr, en: it.en, lesson: it.date, ...all[it.id], due: new Date(all[it.id].due).toISOString() }))
  await $.fs.write(base + '/practice-state.json', JSON.stringify(state, null, 2) + '\n')
}

async function openPane($) {
  await $.ui.open({ id: PANE, title: 'Türkçe', focus: true, closeOnEscape: true })
}

function untilText(ms) {
  if (ms <= 0) return 'now'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return 'in ' + minutes + ' min'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return 'in ' + hours + ' h'
  return 'in ' + Math.round(ms / DAY) + ' days'
}

// The line above a typed answer's result: [is it good news, the text]
const HEADLINES = {
  exact: [true, '✓ Doğru!'],
  letters: [true, '≈ Right. Check the Turkish letters (ı ş ğ ç ö ü)'],
  different: [false, '✗ Not quite. Compare the words'],
  skipped: [false, 'The answer'],
  variant: [true, '✓ Counted as right'],
  wrong: [false, '✗ Counted as wrong. It comes back soon'],
}

const LABELS = { intro: 'New word', recognize: 'What does it mean?', cloze: 'Fill the gap', produce: 'Translate into Turkish' }

// The card itself, for the band (compact) and the pane (large).
// Every control calls back into the module, so both drawings stay in step.
function cardView($, el, isLarge) {
  const { Box, Text, Button, Input, Markdown } = el
  const redraw = () => $.ui.invalidate('ui.render')
  const c = card
  const it = c.item
  const r = c.result
  const heading = (text) => (isLarge ? Markdown({ key: 'tr-prompt', text: '### ' + text }) : Text({ bold: true, wrap: 'wrap', children: [text] }))
  const row = (children) => Box({ flexDirection: 'row', columnGap: 1, children })
  const next = () =>
    Button({
      key: 'tr-next',
      label: '→ Next',
      variant: 'primary',
      autoFocus: true,
      onPress: async () => {
        pickNext(await $.clock.now())
        redraw()
      },
    })
  const note = () => (it.note ? [Markdown({ key: 'tr-note', text: it.note })] : [])
  const verdictLine = (isRight, text) => Text({ bold: true, color: isRight ? RIGHT : WRONG, wrap: 'wrap', children: [text] })

  // The options of a choice card, A to D
  const choices = (correct, onChoose) =>
    Box({
      flexDirection: isLarge ? 'column' : 'row',
      flexWrap: 'wrap',
      columnGap: 1,
      rowGap: isLarge ? 1 : 0,
      children: c.options.map((option, i) =>
        Button({
          key: 'tr-option-' + i,
          label: LETTERS[i] + '. ' + option,
          variant: 'secondary',
          onPress: async () => {
            const isRight = option === correct
            c.result = { isRight, given: option }
            redraw()
            await onChoose(option, isRight)
          },
        }),
      ),
    })

  if (c.stage === 'intro') {
    return [
      heading('🇹🇷 ' + it.tr + ' — ' + it.en),
      ...(it.example ? [Text({ wrap: 'wrap', children: [it.example.tr] }), Text({ italic: true, dimColor: true, wrap: 'wrap', children: [it.example.en] })] : []),
      ...note(),
      row([
        Button({
          key: 'tr-got-it',
          label: '✓ Got it',
          variant: 'primary',
          autoFocus: true,
          onPress: async () => {
            // Save first: the next pick must see this item as no longer new
            await record($, c, true, '', 'seen')
            pickNext(await $.clock.now())
            redraw()
          },
        }),
      ]),
    ]
  }

  if (c.stage === 'recognize') {
    if (!r) return [heading('🇹🇷 ' + it.tr), choices(it.en, (option, isRight) => record($, c, isRight, option, isRight ? 'right' : 'wrong'))]
    return [
      heading('🇹🇷 ' + it.tr),
      verdictLine(r.isRight, r.isRight ? '✓ Doğru! ' + it.en : '✗ It means: ' + it.en),
      ...note(),
      row([next()]),
    ]
  }

  if (c.stage === 'cloze') {
    const z = it.cloze
    const prompt = [
      ...(z.hint ? [Text({ italic: true, dimColor: true, wrap: 'wrap', children: [z.hint] })] : []),
      heading(z.text.replace('___', ' ＿＿＿ ')),
    ]
    if (!r) return [...prompt, choices(z.answer, (option, isRight) => record($, c, isRight, option, isRight ? 'right' : 'wrong'))]
    return [
      ...prompt,
      verdictLine(r.isRight, (r.isRight ? '✓ Doğru! ' : '✗ ') + z.text.replace('___', z.answer)),
      ...(z.explain ? [Markdown({ key: 'tr-explain', text: z.explain })] : note()),
      row([next()]),
    ]
  }

  // produce: type the Turkish
  const prompt = heading(it.en)
  if (!r) {
    return [
      prompt,
      Input({
        key: 'tr-answer',
        label: 'Türkçe',
        placeholder: 'Type the Turkish sentence',
        value: '',
        submitLabel: 'Check',
        ...(isLarge ? { autoFocus: true } : {}),
        onSubmit: async (value) => {
          if (!value.trim()) return
          const g = grade(value, it.tr)
          c.result = { given: value.trim(), ...g, isPending: g.verdict === 'different' }
          redraw()
          // A clear result is saved now; a different answer waits for the self-check
          if (g.verdict !== 'different') await record($, c, true, value.trim(), g.verdict)
        },
      }),
      row([
        Button({
          key: 'tr-show',
          label: 'Show the answer',
          variant: 'secondary',
          onPress: async () => {
            c.result = { given: '', verdict: 'skipped', words: grade('', it.tr).words, isRight: false }
            redraw()
            await record($, c, false, '', 'skipped')
          },
        }),
      ]),
    ]
  }
  const selfCheck = async (isRight) => {
    c.result = { ...r, verdict: isRight ? 'variant' : 'wrong', isPending: false }
    redraw()
    await record($, c, isRight, r.given, isRight ? 'variant' : 'wrong')
  }
  // The expected sentence once, as written; after a typed answer the words that differ are colored
  const sentence = Box({
    key: 'tr-expected',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 1,
    children: r.words.map((w) =>
      r.given && w.status !== 'ok'
        ? Text({ bold: true, color: w.status === 'letters' ? AMBER : WRONG, children: [w.raw] })
        : Text({ bold: true, children: [w.raw] }),
    ),
  })
  const [isGood, headline] = HEADLINES[r.verdict]
  return [
    prompt,
    verdictLine(isGood, headline),
    ...(r.given ? [Text({ dimColor: true, wrap: 'wrap', children: ['You wrote: ' + r.given] })] : []),
    sentence,
    ...note(),
    row(
      r.isPending
        ? [
            Button({ key: 'tr-variant', label: '✓ Mine is right too', variant: 'secondary', onPress: () => selfCheck(true) }),
            Button({ key: 'tr-wrong', label: '✗ Mine is wrong', variant: 'primary', autoFocus: true, onPress: () => selfCheck(false) }),
          ]
        : [next()],
    ),
  ]
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
      description: 'Turkish flashcards and today\'s lesson',
      argumentHint: '[lesson]',
      immediate: true,
    })
    return next(e)
  })

  // When Claude's answer ends, an answered card makes room for the next one.
  // An unanswered card stays, so no card is passed over unseen.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer') return result
    await ensureFresh($)
    if (!card || (card.result && !card.result.isPending)) {
      pickNext(await $.clock.now())
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('command.run', { command: 'tr' }, async ($, e) => {
    await ensureFresh($)
    tab = e.args.trim() === 'lesson' ? 'lesson' : 'study'
    await openPane($)
    $.ui.invalidate('ui.render')
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (e.surface !== 'desktop' || items.length === 0) return theirs
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const redraw = () => $.ui.invalidate('ui.render')
    const now = await $.clock.now()
    // Icon buttons: one glyph is a control by itself
    const icon = (key, glyph, onPress) => Button({ key, label: glyph, plain: true, dimColor: true, onPress })
    const openIcon = icon('tr-open', '⤢', async () => {
      tab = 'study'
      await openPane($)
      redraw()
    })

    let band
    if (!card) {
      const soon = nextDue(items, srs)
      band = Box({
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 2,
        children: [
          Text({ bold: true, children: ['🇹🇷 All caught up'] }),
          Box({ flexGrow: 1, children: [Text({ dimColor: true, children: [soon ? 'Next review ' + untilText(srs[soon.id].due - now) : 'No cards yet'] })] }),
          ...(soon
            ? [
                Button({
                  key: 'tr-more',
                  label: 'Practice more',
                  variant: 'secondary',
                  onPress: () => {
                    practiceMore()
                    redraw()
                  },
                }),
              ]
            : []),
          openIcon,
        ],
      })
    } else {
      band = Box({
        flexDirection: 'column',
        children: [
          Box({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            children: [
              Text({ dimColor: true, children: ['🇹🇷 ' + LABELS[card.stage] + (card.isNew ? ' · new' : '')] }),
              Box({
                flexDirection: 'row',
                columnGap: 2,
                children: [
                  ...(card.result
                    ? []
                    : [
                        icon('tr-skip', '⏭', async () => {
                          skipped.add(card.item.id)
                          pickNext(await $.clock.now())
                          redraw()
                        }),
                      ]),
                  openIcon,
                ],
              }),
            ],
          }),
          ...cardView($, el, false),
        ],
      })
    }
    return theirs ? Box({ flexDirection: 'column', rowGap: 1, children: [band, theirs] }) : band
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE || e.surface !== 'desktop') return next(e)
    const el = $.ui.resolve(e)
    const { Box, Text, Button, Markdown, Svg } = el
    const redraw = () => $.ui.invalidate('ui.render')
    const now = await $.clock.now()
    const counts = summary(items, srs, now)

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
    const header = Box({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      children: [
        Box({ flexDirection: 'row', columnGap: 1, children: [tabButton('study', 'Study'), tabButton('lesson', 'Lesson')] }),
        Box({
          flexDirection: 'row',
          alignItems: 'center',
          columnGap: 1,
          children: [
            Svg({ source: progressRing(dayStats.right, dayStats.wrong), alt: 'Today: ' + dayStats.right + ' right, ' + dayStats.wrong + ' wrong', width: 44, height: 44 }),
            Box({
              flexDirection: 'column',
              children: [
                Text({ dimColor: true, children: [counts.due + ' due · ' + Math.max(0, NEW_PER_DAY - newToday) + ' new left'] }),
                Text({ dimColor: true, children: [counts.learning + ' learning · ' + counts.known + ' known'] }),
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
    } else if (!card) {
      const soon = nextDue(items, srs)
      body = [
        Markdown({
          key: 'tr-done',
          text: '### All caught up\n\n' + (soon ? 'The next review is due ' + untilText(srs[soon.id].due - now) + '.' : 'No cards yet. The lessons in `' + base + '` feed the cards.'),
        }),
        ...(soon
          ? [
              Box({
                flexDirection: 'row',
                children: [
                  Button({
                    key: 'tr-more',
                    label: 'Practice more',
                    variant: 'primary',
                    autoFocus: true,
                    onPress: () => {
                      practiceMore()
                      redraw()
                    },
                  }),
                ],
              }),
            ]
          : []),
      ]
    } else {
      body = [
        Text({ dimColor: true, children: [LABELS[card.stage] + (card.isNew ? ' · new' : '') + ' · from the ' + card.item.date + ' lesson'] }),
        ...cardView($, el, true),
      ]
    }

    return Box({ flexDirection: 'column', rowGap: 1, padding: 1, children: [header, ...body] })
  })
}
