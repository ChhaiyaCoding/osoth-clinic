import { db, emptyMonograph, type DrugRow } from './db'
import { newId } from '../lib/id'
import type { BaseRecord, Drug, Id, Monograph, MonographBlock, MonographSectionKey } from './types'
import { compareKhmer, drugSearchTokens, normalize } from '../lib/search'
import type { Language } from '../i18n'

/** The editable fields of a drug — everything except the id/timestamp envelope. */
export type DrugInput = Omit<Drug, keyof BaseRecord>

/** The name to show for a drug, falling back to the other language if one is blank. */
export function drugDisplayName(drug: Drug, lang: Language): string {
  const [primary, secondary] =
    lang === 'km' ? [drug.nameKh, drug.nameEn] : [drug.nameEn, drug.nameKh]
  return primary.trim() || secondary.trim() || drug.generic.trim() || drug.code
}

export function emptyDrugInput(): DrugInput {
  return {
    code: '',
    nameKh: '',
    nameEn: '',
    nameJa: '',
    generic: '',
    brandNames: [],
    classes: [],
    rxStatus: 'rx',
    monograph: emptyMonograph(),
    form: 'tablet',
    strength: '',
    unit: '',
    packSize: 1,
    reorderLevel: 0,
    costPrice: 0,
    sellPrice: 0,
    note: '',
    isControlled: false,
    isArchived: false,
  }
}

function toRow(drug: Drug): DrugRow {
  return { ...drug, searchText: drugSearchTokens(drug) }
}

/**
 * Drugs matching `query` in Khmer, English, generic name or code.
 *
 * The query hits the multi-entry index as a prefix, so partial words match;
 * archived and soft-deleted rows are filtered afterwards because IndexedDB
 * cannot combine a multi-entry index with another equality filter in one query.
 */
export async function searchDrugs(
  query: string,
  { includeArchived = false, lang = 'km' as Language } = {},
): Promise<Drug[]> {
  const q = normalize(query)
  const rows = q
    ? await db.drugs.where('searchText').startsWith(q).distinct().toArray()
    : await db.drugs.toArray()

  return rows
    .filter((drug) => !drug.deletedAt && (includeArchived || !drug.isArchived))
    .sort((a, b) => compareKhmer(drugDisplayName(a, lang), drugDisplayName(b, lang)))
}

export async function getDrug(id: Id): Promise<Drug | undefined> {
  return db.drugs.get(id)
}

/** True if another (non-deleted) drug already uses this code. */
export async function isCodeTaken(code: string, exceptId?: Id): Promise<boolean> {
  if (!code.trim()) return false
  const matches = await db.drugs.where('code').equalsIgnoreCase(code.trim()).toArray()
  return matches.some((drug) => drug.id !== exceptId && !drug.deletedAt)
}

export async function createDrug(input: DrugInput): Promise<Id> {
  const now = new Date().toISOString()
  const drug: Drug = {
    ...input,
    code: input.code.trim(),
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.drugs.add(toRow(drug))
  return drug.id
}

export async function updateDrug(id: Id, input: DrugInput): Promise<void> {
  const existing = await db.drugs.get(id)
  if (!existing) throw new Error(`Drug ${id} not found`)
  const updated: Drug = {
    ...existing,
    ...input,
    code: input.code.trim(),
    id,
    updatedAt: new Date().toISOString(),
  }
  await db.drugs.put(toRow(updated))
}

/** Soft delete — the row stays so stock history keeps resolving its drug. */
export async function deleteDrug(id: Id): Promise<void> {
  const now = new Date().toISOString()
  await db.drugs.update(id, { deletedAt: now, updatedAt: now })
}

export async function restoreDrug(id: Id): Promise<void> {
  const now = new Date().toISOString()
  await db.drugs.update(id, { deletedAt: null, updatedAt: now })
}

/**
 * Replace one monograph section's blocks, or the pregnancy category / lactation
 * text. Written as a whole-monograph patch so a section edit is a single
 * atomic write rather than a read-modify-write spread over the UI.
 */
export async function updateMonograph(id: Id, patch: Partial<Monograph>): Promise<void> {
  const existing = await db.drugs.get(id)
  if (!existing) throw new Error(`Drug ${id} not found`)
  await db.drugs.update(id, {
    monograph: { ...emptyMonograph(), ...existing.monograph, ...patch },
    updatedAt: new Date().toISOString(),
  })
}

export function newBlock(audience?: MonographBlock['audience']): MonographBlock {
  return { id: newId(), heading: '', items: [''], ...(audience ? { audience } : {}) }
}

/** True when a section has nothing worth showing — used to grey out its row. */
export function isSectionEmpty(monograph: Monograph, section: MonographSectionKey): boolean {
  if (section === 'pregnancy' && (monograph.pregnancyCategory !== 'NA' || monograph.lactation.trim()))
    return false
  return monograph[section].every(
    (block) => !block.heading.trim() && block.items.every((item) => !item.trim()),
  )
}

/** Drop blank headings and items so saving a half-filled editor stays tidy. */
export function pruneBlocks(blocks: MonographBlock[]): MonographBlock[] {
  return blocks
    .map((block) => ({ ...block, items: block.items.filter((item) => item.trim()) }))
    .filter((block) => block.heading.trim() || block.items.length > 0)
}
