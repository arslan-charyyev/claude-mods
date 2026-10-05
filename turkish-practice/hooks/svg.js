// Pure SVG builders for the Desktop pane. The app draws an Svg as an isolated
// image, so the markup cannot read the app's theme: every color here is a
// mid-tone that reads on both a dark and a light background.

const FONT = "Inter, 'Segoe UI', Ubuntu, Roboto, system-ui, sans-serif"
const RIGHT = '#3fa55a'
const WRONG = '#e05252'
const TRACK = 'rgba(128, 128, 128, 0.45)'
const LABEL = '#8f8f8f'

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
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="5"/>` +
    (right > 0 ? arc(rightLen, 0, RIGHT) : '') +
    (wrong > 0 ? arc(c - rightLen, rightLen, WRONG) : '') +
    `<text x="${cx}" y="${cx + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${LABEL}">${total}</text>` +
    `</svg>`
  )
}
