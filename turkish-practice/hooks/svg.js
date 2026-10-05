// Pure SVG builders for the Desktop pane. The app draws an Svg as an isolated
// image, so the markup cannot read the app's theme: every color here is a
// mid-tone that reads on both a dark and a light background, and fills are
// translucent so the background shows through.

const FONT = "Inter, 'Segoe UI', Ubuntu, Roboto, system-ui, sans-serif"

const TONES = {
  ok: { fill: 'rgba(46, 160, 67, 0.16)', stroke: 'rgba(46, 160, 67, 0.55)', text: '#3fa55a' },
  letters: { fill: 'rgba(210, 153, 34, 0.16)', stroke: 'rgba(210, 153, 34, 0.6)', text: '#c9962a' },
  missing: { fill: 'rgba(218, 68, 68, 0.16)', stroke: 'rgba(218, 68, 68, 0.6)', text: '#e05252' },
  plain: { fill: 'rgba(128, 128, 128, 0.12)', stroke: 'rgba(128, 128, 128, 0.45)', text: '#8f8f8f' },
}

const HEADLINES = {
  exact: ['ok', '✓ Doğru!'],
  letters: ['letters', '≈ Right, but check the Turkish letters'],
  different: ['missing', '✗ Not quite. Compare the words'],
  skipped: ['plain', 'The answer'],
  variant: ['ok', '✓ Counted as right'],
  wrong: ['missing', '✗ Counted as wrong. It comes back later'],
}

export function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

// A rough text width for a proportional sans font: no font metrics exist in an
// isolated image, so the chips take a generous per-character width
function textWidth(text, size) {
  return [...text].length * size * 0.6
}

// The answer card: the verdict line, then one rounded chip per expected word,
// colored by how the answer matched it, wrapped onto as many rows as needed
export function answerCard({ verdict, words, hasAnswer }, width = 520) {
  const [toneName, headline] = HEADLINES[verdict] ?? HEADLINES.skipped
  const tone = TONES[toneName]
  const pad = 16
  const chipH = 32
  const gap = 8
  const size = 16

  const chips = []
  let x = pad
  let y = 52
  for (const w of words) {
    const chipTone = hasAnswer ? TONES[w.status] : TONES.plain
    const chipW = Math.ceil(textWidth(w.word, size) + 24)
    if (x + chipW > width - pad && x > pad) {
      x = pad
      y += chipH + gap
    }
    chips.push(
      `<rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="9" fill="${chipTone.fill}" stroke="${chipTone.stroke}"/>` +
        `<text x="${x + chipW / 2}" y="${y + chipH / 2 + 5.5}" text-anchor="middle" font-size="${size}" font-weight="600" fill="${chipTone.text}">${escapeXml(w.word)}</text>`,
    )
    x += chipW + gap
  }
  const height = y + chipH + pad

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${tone.fill}" stroke="${tone.stroke}"/>` +
    `<text x="${pad}" y="32" font-size="17" font-weight="700" fill="${tone.text}">${escapeXml(headline)}</text>` +
    chips.join('') +
    `</svg>`
  )
}

// Today's progress: a ring split into right (green) and wrong (red), the
// number of answers in the middle; an empty grey ring before the first answer
export function progressRing(right, wrong, size = 44) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const total = right + wrong
  const cx = size / 2
  const arc = (length, offset, color) =>
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="butt" ` +
    `stroke-dasharray="${length} ${c - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cx})"/>`
  const rightLen = total === 0 ? 0 : (c * right) / total
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="${FONT}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${TONES.plain.stroke}" stroke-width="5"/>` +
    (right > 0 ? arc(rightLen, 0, TONES.ok.text) : '') +
    (wrong > 0 ? arc(c - rightLen, rightLen, TONES.missing.text) : '') +
    `<text x="${cx}" y="${cx + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${TONES.plain.text}">${total}</text>` +
    `</svg>`
  )
}
