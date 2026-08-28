import { db, emptyMonograph } from './db'
import type { Drug, DrugForm } from './types'
import { drugSearchTokens, normalize } from '../lib/search'
import { newId } from '../lib/id'

/**
 * A reference medicine list shipped with the app, converted from a published
 * PDF. Only the six columns the source actually has are carried:
 * drug class, drug name, dosage form, strength, annotation, Japanese name.
 * Prices, pack sizes and stock are the clinic's own data and stay untouched.
 */
export interface CatalogEntry {
  /** The match key. Everything else is optional on purpose — see below. */
  code: string
  /**
   * Every field is optional because `undefined` carries meaning: "the file said
   * nothing about this", which must leave whatever is stored untouched.
   *
   * Without that distinction a spreadsheet holding only names and prices would
   * write empty strings over strengths, classes and forms — silently destroying
   * the reference data it was never meant to touch.
   */
  nameEn?: string
  nameKh?: string
  nameJa?: string
  generic?: string
  brandNames?: string[]
  classes?: string[]
  form?: DrugForm
  formLabel?: string | null
  strength?: string
  unit?: string
  isControlled?: boolean
  note?: string
  costPrice?: number
  sellPrice?: number
  reorderLevel?: number
  packSize?: number
  /**
   * Set for rows that identify a drug by code alone. They may update an
   * existing record but must never create a nameless one.
   */
  updateOnly?: boolean
  /**
   * True when `code` was invented from the name because the file had no code
   * column. Such a code cannot be trusted to match, so the importer falls back
   * to matching by name — otherwise a sheet of names would duplicate the lot.
   */
  codeDerived?: boolean
}


export interface Catalog {
  source: string
  version: string
  medicines: CatalogEntry[]
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
}

/** Loaded on demand so 200 KB of reference data stays out of the initial bundle. */
export async function loadCatalog(): Promise<Catalog> {
  const module = await import('../data/acmc-medicines.json')
  return module.default as Catalog
}

/** Drops keys whose value is `undefined`, so a spread cannot erase a field. */
function definedOnly<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

/**
 * Insert or update medicines, matched by `code`.
 *
 * The rule throughout: **only what the file actually carried is written.** A
 * spreadsheet holding just codes and prices updates prices and nothing else;
 * absent columns leave the stored values alone. That is what makes it safe to
 * bulk-edit one attribute of a catalogue without re-stating all the others.
 */
export async function importCatalog(entries: CatalogEntry[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }

  await db.transaction('rw', db.drugs, async () => {
    const existing = await db.drugs.toArray()
    const byCode = new Map(existing.map((drug) => [drug.code.toLowerCase(), drug]))

    // Name index for files that carry no code column. First writer wins, so an
    // ambiguous name updates the earliest record rather than picking at random.
    const byName = new Map<string, (typeof existing)[number]>()
    for (const drug of existing) {
      for (const candidate of [drug.nameEn, drug.generic, drug.nameKh]) {
        const key = normalize(candidate ?? '')
        if (key && !byName.has(key)) byName.set(key, drug)
      }
    }

    const now = new Date().toISOString()

    for (const entry of entries) {
      const current =
        byCode.get(entry.code.toLowerCase()) ??
        (entry.codeDerived
          ? byName.get(normalize(entry.nameEn ?? entry.generic ?? entry.nameKh ?? ''))
          : undefined)

      const patch = definedOnly({
        nameEn: entry.nameEn,
        nameJa: entry.nameJa,
        generic: entry.generic,
        brandNames: entry.brandNames,
        classes: entry.classes,
        form: entry.form,
        formLabel: entry.formLabel ?? undefined,
        strength: entry.strength,
        unit: entry.unit,
        isControlled: entry.isControlled,
        note: entry.note,
        costPrice: entry.costPrice,
        sellPrice: entry.sellPrice,
        reorderLevel: entry.reorderLevel,
        packSize: entry.packSize,
      })

      if (current) {
        if (current.deletedAt) {
          // The clinic deliberately removed this one; don't resurrect it.
          result.skipped += 1
          continue
        }
        const merged: Drug = {
          ...current,
          ...patch,
          // An invented code must not overwrite the real one on the record.
          code: entry.codeDerived ? current.code : entry.code,
          // A Khmer name the clinic typed always wins, but filling a blank one
          // from the file costs nothing and is usually the point of re-importing.
          nameKh: current.nameKh.trim() || (entry.nameKh ?? ''),
          updatedAt: now,
        }
        await db.drugs.put({ ...merged, searchText: drugSearchTokens(merged) })
        result.updated += 1
        continue
      }

      // Nothing to update, and a row identified only by code has no name to
      // create a record from.
      if (entry.updateOnly || !(entry.nameEn || entry.nameKh || entry.generic)) {
        result.skipped += 1
        continue
      }

      const drug: Drug = {
        id: newId(),
        code: entry.code,
        nameEn: entry.nameEn ?? '',
        nameKh: entry.nameKh ?? '',
        nameJa: entry.nameJa ?? '',
        generic: entry.generic ?? entry.nameEn ?? '',
        brandNames: entry.brandNames ?? [],
        classes: entry.classes ?? [],
        rxStatus: 'rx',
        monograph: emptyMonograph(),
        form: entry.form ?? 'other',
        formLabel: entry.formLabel ?? undefined,
        strength: entry.strength ?? '',
        unit: entry.unit ?? 'unit',
        packSize: entry.packSize ?? 1,
        reorderLevel: entry.reorderLevel ?? 0,
        costPrice: entry.costPrice ?? 0,
        sellPrice: entry.sellPrice ?? 0,
        note: entry.note ?? '',
        isControlled: entry.isControlled ?? false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await db.drugs.add({ ...drug, searchText: drugSearchTokens(drug) })
      result.added += 1
    }
  })

  return result
}
