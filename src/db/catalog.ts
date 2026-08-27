import { db, emptyMonograph } from './db'
import type { Drug, DrugForm } from './types'
import { drugSearchTokens } from '../lib/search'
import { newId } from '../lib/id'

/**
 * A reference medicine list shipped with the app, converted from a published
 * PDF. Only the six columns the source actually has are carried:
 * drug class, drug name, dosage form, strength, annotation, Japanese name.
 * Prices, pack sizes and stock are the clinic's own data and stay untouched.
 */
export interface CatalogEntry {
  code: string
  nameEn: string
  nameJa: string
  /** Only used when creating a drug — never overwrites a name the clinic typed. */
  nameKh?: string
  generic: string
  brandNames: string[]
  classes: string[]
  form: DrugForm
  formLabel?: string | null
  strength: string
  unit: string
  isControlled: boolean
  note: string
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

/**
 * Insert the catalog, matching existing rows by `code`.
 *
 * Reference fields are refreshed on an existing drug, but anything the clinic
 * owns — prices, pack size, reorder level, the Khmer name, the monograph — is
 * left exactly as it was. That makes re-importing a newer list safe.
 */
export async function importCatalog(entries: CatalogEntry[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }

  await db.transaction('rw', db.drugs, async () => {
    const existing = await db.drugs.toArray()
    const byCode = new Map(existing.map((drug) => [drug.code.toLowerCase(), drug]))
    const now = new Date().toISOString()

    for (const entry of entries) {
      const current = byCode.get(entry.code.toLowerCase())

      const reference = {
        code: entry.code,
        nameEn: entry.nameEn,
        nameJa: entry.nameJa,
        generic: entry.generic,
        brandNames: entry.brandNames,
        classes: entry.classes,
        form: entry.form,
        formLabel: entry.formLabel ?? undefined,
        strength: entry.strength,
        isControlled: entry.isControlled,
        note: entry.note,
      }

      if (current) {
        if (current.deletedAt) {
          // The clinic deliberately removed this one; don't resurrect it.
          result.skipped += 1
          continue
        }
        const merged: Drug = {
          ...current,
          ...reference,
          // A Khmer name the clinic typed always wins, but filling a blank one
          // from the file costs nothing and is usually the point of re-importing.
          nameKh: current.nameKh.trim() || (entry.nameKh ?? ''),
          updatedAt: now,
        }
        await db.drugs.put({ ...merged, searchText: drugSearchTokens(merged) })
        result.updated += 1
        continue
      }

      const drug: Drug = {
        ...reference,
        id: newId(),
        nameKh: entry.nameKh ?? '',
        rxStatus: 'rx',
        monograph: emptyMonograph(),
        unit: entry.unit,
        packSize: 1,
        reorderLevel: 0,
        costPrice: 0,
        sellPrice: 0,
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
