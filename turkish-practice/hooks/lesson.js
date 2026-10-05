// Pure helpers: parse a daily lesson file and grade a drill answer.
// No mods API here, so node and the test kit can both import this file.

const SOTD = /🇹🇷\s*\*\*(.+?)\*\*\s*—\s*\*(.+?)\*/
const BOLD_PAIR_NUMBERED = /^\d+\.\s+\*\*(.+?)\*\*\s+—\s+(.+)$/
const BOLD_PAIR_BULLET = /^-\s+\*\*(.+?)\*\*\s+—\s+(.+)$/
const NUMBERED = /^\d+\.\s+(.+)$/

// Split a lesson into { heading: body } by its `## ` headings
export function sections(md) {
  const out = []
  let current = { heading: '', lines: [] }
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      out.push(current)
      current = { heading: line.slice(3).trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  out.push(current)
  return out
}

// "Et yemem, sebze yerim. (`ye-me-m`: a choice.)" -> { tr, note }
export function splitNote(text) {
  const t = text.trim()
  // Some lessons write the answer in bold: "**Bu ay kirayı ödeyemem.** (`kira-yı`: ...)"
  const bold = t.match(/^\*\*(.+?)\*\*\s*(.*)$/)
  if (bold) {
    const rest = bold[2].trim()
    return { tr: bold[1].trim(), note: rest.startsWith('(') && rest.endsWith(')') ? rest.slice(1, -1).trim() : rest }
  }
  if (!t.endsWith(')')) return { tr: t, note: '' }
  let depth = 0
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ')') depth++
    else if (t[i] === '(') {
      depth--
      if (depth === 0) {
        const tr = t.slice(0, i).trim()
        // A parenthesis inside the sentence itself, not a trailing note
        if (!/[.?!]$/.test(tr)) return { tr: t, note: '' }
        return { tr, note: t.slice(i + 1, -1).trim() }
      }
    }
  }
  return { tr: t, note: '' }
}

// Read one lesson file into sentences (Turkish with English) and drill items
export function parseLesson(md, date) {
  const sentences = []
  const drill = []
  let prompts = []
  let answers = []

  for (const { heading, lines } of sections(md)) {
    if (/^Five examples/i.test(heading)) {
      for (const line of lines) {
        const m = line.match(BOLD_PAIR_NUMBERED)
        if (m) sentences.push({ tr: m[1].trim(), en: m[2].trim(), kind: 'example', date })
      }
    } else if (/^The contrast/i.test(heading)) {
      for (const line of lines) {
        const m = line.match(BOLD_PAIR_BULLET)
        if (m) sentences.push({ tr: m[1].trim(), en: m[2].trim(), kind: 'contrast', date })
      }
    } else if (/^Sentence of the day/i.test(heading)) {
      const m = lines.join('\n').match(SOTD)
      if (m) sentences.push({ tr: m[1].trim(), en: m[2].trim(), kind: 'sotd', date })
    } else if (/^Production drill/i.test(heading)) {
      prompts = lines.map((l) => l.match(NUMBERED)).filter(Boolean).map((m) => m[1].trim())
    } else if (/^Answers/i.test(heading)) {
      // The drill answers sit between a "Drill:" line and the next "Xxx:" label line
      let inDrill = false
      for (const line of lines) {
        const label = line.trim()
        if (/^Drill:?$/i.test(label)) inDrill = true
        else if (/^[A-Z][\w -]*:$/.test(label)) inDrill = false
        else if (inDrill) {
          const m = line.match(NUMBERED)
          if (m) answers.push(splitNote(m[1]))
        }
      }
    }
  }

  // Pair a prompt with its answer only when the counts agree, so no answer lands on the wrong prompt
  if (prompts.length > 0 && prompts.length === answers.length) {
    prompts.forEach((en, i) => drill.push({ en, tr: answers[i].tr, note: answers[i].note, kind: 'drill', date }))
  }
  return { date, sentences, drill }
}

// The lesson text a learner reads first: everything above the answers
export function lessonBody(md) {
  const i = md.search(/^## Answers/m)
  return (i === -1 ? md : md.slice(0, i)).trim()
}

// Lowercase with Turkish rules (İ -> i, I -> ı), drop punctuation and extra spaces.
// An apostrophe joins its word ("İstanbul'a" -> "istanbula"), so a word stays one word.
export function normalize(text) {
  return text
    .toLocaleLowerCase('tr')
    .replace(/['‘’`]/g, '')
    .replace(/[.,!?;:"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The words of a sentence as written, without the punctuation at their edges
function displayWords(text) {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[.,!?;:"“”()`]+|[.,!?;:"“”()`]+$/g, ''))
    .filter(Boolean)
}

// Fold the Turkish letters to their ASCII look-alikes: "karanlık" -> "karanlik"
export function fold(text) {
  return text.replace(/[ıİçÇğĞöÖşŞüÜâÂîÎûÛ]/g, (c) => ({ ı: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a', î: 'i', Î: 'i', û: 'u', Û: 'u' })[c])
}

// Compare an answer with the expected sentence, word by word.
// verdict: 'exact', 'letters' (right apart from Turkish letters), or 'different'.
// Each expected word is 'ok', 'letters', or 'missing' in the answer.
export function grade(answer, expected) {
  const a = normalize(answer)
  const x = normalize(expected)
  const given = new Set(a.split(' '))
  const givenFolded = new Set(a.split(' ').map(fold))
  const shown = displayWords(expected)
  const keys = x.split(' ')
  // Show each word as written ("Oda", not "oda") when the two splits agree
  const words = keys.map((key, i) => ({
    word: shown.length === keys.length ? shown[i] : key,
    status: given.has(key) ? 'ok' : givenFolded.has(fold(key)) ? 'letters' : 'missing',
  }))
  const verdict = a === x ? 'exact' : fold(a) === fold(x) ? 'letters' : 'different'
  return { verdict, words }
}

// YYYY-MM-DD in local time
export function localDate(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

// Fisher-Yates on a copy
export function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
