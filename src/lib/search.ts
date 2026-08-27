import type { Drug } from '../db/types'

/**
 * Invisible characters that routinely end up inside typed Khmer text and would
 * otherwise make two visually identical strings fail to match:
 * zero-width space/non-joiner/joiner, the word joiner, and the two Khmer
 * inherent-vowel signs that some keyboards emit but nothing renders.
 */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u17B4\u17B5]/g

/**
 * Fold a string into its comparable form: composed (NFC), stripped of
 * invisibles, lowercased, whitespace collapsed. Safe for Khmer and Latin alike.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Separators that start a new searchable word. Beyond whitespace this covers
 * the punctuation drug names are full of, so a search matches a part of a name
 * rather than only its beginning: the Japanese "【カロナール】アセトアミノフェン"
 * becomes findable by either the brand or the generic, and
 * "Sulfamethoxazole + Trimetoprim" by either component.
 */
const SEPARATORS = /[\s【】()[\]{}+/,;:.]+/

/**
 * Tokens written to the multi-entry `*searchText` index: the whole normalized
 * field plus each of its words. Lookups match a token's *prefix*, so indexing
 * every word is what makes a mid-name term findable.
 */
export function buildSearchTokens(...fields: (string | undefined)[]): string[] {
  const tokens = new Set<string>()
  for (const field of fields) {
    if (!field) continue
    const whole = normalize(field)
    if (!whole) continue
    tokens.add(whole)
    for (const word of whole.split(SEPARATORS)) {
      if (word) tokens.add(word)
    }
  }
  return [...tokens]
}

/**
 * Every name a staff member might type: shelf code, Khmer, English, Japanese,
 * generic and any brand on the box.
 */
export function drugSearchTokens(
  drug: Pick<Drug, 'code' | 'nameKh' | 'nameEn' | 'nameJa' | 'generic' | 'brandNames'>,
) {
  return buildSearchTokens(
    drug.code,
    drug.nameKh,
    drug.nameEn,
    drug.nameJa,
    drug.generic,
    ...(drug.brandNames ?? []),
  )
}

/**
 * Khmer-aware sort. `localeCompare` with the 'km' locale orders Khmer script
 * correctly, which a raw `<` comparison on code units does not.
 */
export function compareKhmer(a: string, b: string): number {
  return a.localeCompare(b, 'km', { numeric: true, sensitivity: 'base' })
}
