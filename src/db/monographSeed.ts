import { db, emptyMonograph } from './db'
import { newId } from '../lib/id'
import { normalize } from '../lib/search'
import type { Monograph, MonographBlock, MonographSectionKey, PregnancyCategory } from './types'
import { MONOGRAPH_SECTIONS } from './types'

/**
 * Bundled starter monographs.
 *
 * Keyed by generic drug, so one entry covers every strength and form of it in
 * the medicine list. The text is reference material, not this clinic's protocol
 * — every drug it touches is marked with `monographSource` and left unreviewed
 * until a pharmacist signs it off in the app.
 */

/** A section written as heading -> lines, which is far terser than the stored shape. */
export type SeedSection = Record<string, string[]>

export interface MonographSeed {
  /** Generic names this monograph applies to, matched loosely. */
  match: string[]
  dosageAdult?: SeedSection
  dosagePediatric?: SeedSection
  interactions?: SeedSection
  adverseEffects?: SeedSection
  warnings?: SeedSection
  pregnancy?: SeedSection
  pregnancyCategory?: PregnancyCategory
  lactation?: string
  pharmacology?: SeedSection
  administration?: SeedSection
  formulary?: SeedSection
}

export interface MonographSeedFile {
  source: string
  seeds: MonographSeed[]
}

export interface SeedResult {
  drugsUpdated: number
  drugsMatched: number
  seedsWithoutMatch: string[]
}

function toBlocks(section: SeedSection | undefined, audience?: 'adult' | 'pediatric'): MonographBlock[] {
  if (!section) return []
  return Object.entries(section).map(([heading, items]) => ({
    id: newId(),
    heading,
    items,
    ...(audience ? { audience } : {}),
  }))
}

/**
 * Loose match between a drug's generic name and a seed key.
 *
 * The medicine list writes generics with abbreviations and combinations —
 * "Amoxicillin (AMPC)", "Sulfamethoxazole + Trimetoprim" — so the comparison
 * strips bracketed text and compares the remaining components.
 */
function matchKeys(generic: string): string[] {
  const base = normalize(generic)
    .replace(/[（(【][^）)】]*[）)】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const whole = base.replace(/\s*\+\s*/g, ' + ')
  const parts = whole.split(' + ').map((p) => p.trim()).filter(Boolean)
  return [whole, ...parts]
}

export async function loadMonographSeeds(): Promise<MonographSeedFile> {
  const module = await import('../data/monographs.json')
  // Through `unknown`: TypeScript widens each seed in the JSON literal to its
  // own shape with the other seeds' headings typed as `undefined`, which no
  // longer matches the index signature on SeedSection.
  return module.default as unknown as MonographSeedFile
}

/**
 * Apply seeds to matching drugs.
 *
 * A section is only written when the drug has nothing there, so anything the
 * clinic typed always wins and re-running is safe.
 */
export async function applyMonographSeeds(file: MonographSeedFile): Promise<SeedResult> {
  const result: SeedResult = { drugsUpdated: 0, drugsMatched: 0, seedsWithoutMatch: [] }

  const bySeed = new Map<MonographSeed, string[]>()
  const index = new Map<string, MonographSeed>()
  for (const seed of file.seeds) {
    bySeed.set(seed, [])
    for (const name of seed.match) index.set(normalize(name), seed)
  }

  await db.transaction('rw', db.drugs, async () => {
    const drugs = await db.drugs.toArray()
    const now = new Date().toISOString()

    for (const drug of drugs) {
      if (drug.deletedAt) continue

      const seed = matchKeys(drug.generic || drug.nameEn)
        .map((key) => index.get(key))
        .find(Boolean)
      if (!seed) continue

      result.drugsMatched += 1
      bySeed.get(seed)!.push(drug.code)

      const incoming: Partial<Monograph> = {
        dosage: [...toBlocks(seed.dosageAdult, 'adult'), ...toBlocks(seed.dosagePediatric, 'pediatric')],
        interactions: toBlocks(seed.interactions),
        adverseEffects: toBlocks(seed.adverseEffects),
        warnings: toBlocks(seed.warnings),
        pregnancy: toBlocks(seed.pregnancy),
        pharmacology: toBlocks(seed.pharmacology),
        administration: toBlocks(seed.administration),
        formulary: toBlocks(seed.formulary),
      }

      const monograph: Monograph = { ...emptyMonograph(), ...drug.monograph }
      let changed = false

      for (const section of MONOGRAPH_SECTIONS) {
        const blocks = incoming[section as MonographSectionKey]
        if (!blocks || blocks.length === 0) continue
        // Never overwrite what the clinic already wrote.
        if (monograph[section].length > 0) continue
        monograph[section] = blocks
        changed = true
      }

      if (seed.pregnancyCategory && monograph.pregnancyCategory === 'NA') {
        monograph.pregnancyCategory = seed.pregnancyCategory
        changed = true
      }
      if (seed.lactation && !monograph.lactation.trim()) {
        monograph.lactation = seed.lactation
        changed = true
      }

      if (!changed) continue

      await db.drugs.update(drug.id, {
        monograph,
        monographSource: drug.monographSource ?? file.source,
        monographReviewedAt: drug.monographReviewedAt ?? null,
        updatedAt: now,
      })
      result.drugsUpdated += 1
    }
  })

  for (const [seed, codes] of bySeed) {
    if (codes.length === 0) result.seedsWithoutMatch.push(seed.match[0])
  }

  return result
}

/** Marks an imported monograph as checked, which clears the unverified banner. */
export async function markMonographReviewed(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db.drugs.update(id, { monographReviewedAt: now, updatedAt: now })
}
