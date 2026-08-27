import { parseCsv, toCsv } from '../lib/csv'
import { normalize } from '../lib/search'
import { DRUG_FORMS, type DrugForm } from './types'
import type { CatalogEntry } from './catalog'

/**
 * Reading a clinic's own medicine list out of a spreadsheet.
 *
 * The columns are matched by header name rather than position, because every
 * clinic exports its list in a different order, and both the app's own field
 * names and the wording of the ACMC source list are accepted.
 */

/** Header spellings accepted for each field, all compared normalized. */
const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  code: ['code', 'លេខកូដ', 'drug code', 'item code', 'sku'],
  nameEn: ['nameen', 'name en', 'drug names', 'drug name', 'name (english)', 'english name', 'name'],
  nameKh: ['namekh', 'name kh', 'name (khmer)', 'ឈ្មោះ', 'khmer name', 'ឈ្មោះខ្មែរ'],
  nameJa: ['nameja', 'name ja', 'japanese names', 'japanese name', 'name (japanese)'],
  generic: ['generic', 'generic name', 'ឈ្មោះសកល', 'inn'],
  brandNames: ['brand', 'brands', 'brand names', 'trade name', 'ឈ្មោះពាណិជ្ជកម្ម'],
  classes: ['class', 'classes', 'drug classes', 'drug class', 'category', 'ក្រុមឱសថ'],
  form: ['form', 'dosage form', 'dose form', 'ទម្រង់'],
  strength: ['strength', 'កម្លាំងថ្នាំ', 'dose', 'dosage'],
  unit: ['unit', 'ឯកតា'],
  note: ['note', 'notes', 'annotation', 'remark', 'remarks', 'កំណត់ចំណាំ'],
}

export interface ParsedRow {
  code: string
  nameEn: string
  nameKh: string
  nameJa: string
  generic: string
  brandNames: string
  classes: string
  form: string
  strength: string
  unit: string
  note: string
}

export interface ParseIssue {
  /** 1-based row number as the user sees it in their spreadsheet. */
  line: number
  message: string
}

export interface ParsedFile {
  entries: CatalogEntry[]
  issues: ParseIssue[]
  /** Headers present in the file that the app did not recognise. */
  ignoredColumns: string[]
}

const FORM_SET = new Set<string>(DRUG_FORMS)

function splitList(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Best-effort mapping of a free-text dosage form onto the app's enum. Anything
 * unrecognised becomes 'other' and the original wording is kept in `formLabel`,
 * so no clinical detail is lost to the mapping.
 */
function toForm(value: string): DrugForm {
  const text = normalize(value)
  if (!text) return 'other'
  if (FORM_SET.has(text)) return text as DrugForm
  const contains = (...needles: string[]) => needles.some((n) => text.includes(n))
  if (contains('tab', 'គ្រាប់')) return 'tablet'
  if (contains('cap', 'កាប់ស៊ុល')) return 'capsule'
  if (contains('syrup', 'សុីរ៉ូ')) return 'syrup'
  if (contains('suspension', 'nebulis')) return 'suspension'
  if (contains('ampoule', 'vial', 'inject', 'syringe', 'ចាក់')) return 'injection'
  if (contains('infusion', 'bottle', 'សេរ៉ូម')) return 'infusion'
  if (contains('powder', 'sachet', 'ម្សៅ')) return 'powder'
  if (contains('cream', 'emulsion', 'គ្រែម')) return 'cream'
  if (contains('ointment', 'លាប')) return 'ointment'
  if (contains('drop', 'តក់')) return 'drops'
  if (contains('inhal', 'ស្រូប')) return 'inhaler'
  if (contains('spray', 'បាញ់')) return 'spray'
  if (contains('patch', 'បន្ទះ')) return 'patch'
  if (contains('solution', 'enema', 'wash')) return 'solution'
  if (contains('supposit', 'សៀត')) return 'suppository'
  return 'other'
}

/** A shelf code derived from the name and strength, for files that omit one. */
function deriveCode(name: string, strength: string): string {
  const slug = (text: string, limit: number) =>
    text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, limit)
  const base = slug(name, 14) || 'DRUG'
  const suffix = slug(strength, 7)
  return suffix ? `${base}-${suffix}` : base
}

function buildHeaderMap(headers: string[]) {
  const map = new Map<number, keyof ParsedRow>()
  const ignored: string[] = []

  headers.forEach((header, index) => {
    const key = normalize(header)
    if (!key) return
    const field = (Object.keys(HEADER_ALIASES) as (keyof ParsedRow)[]).find((candidate) =>
      HEADER_ALIASES[candidate].some((alias) => normalize(alias) === key),
    )
    if (field && ![...map.values()].includes(field)) map.set(index, field)
    else ignored.push(header)
  })

  return { map, ignored }
}

/** Parse a CSV or JSON file into catalog entries, collecting per-row problems. */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  const text = await file.text()
  return file.name.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsvFile(text)
}

function parseJson(text: string): ParsedFile {
  const data = JSON.parse(text)
  const list: unknown[] = Array.isArray(data) ? data : (data?.medicines ?? [])
  if (!Array.isArray(list)) throw new Error('JSON must be an array, or an object with "medicines".')

  const entries: CatalogEntry[] = []
  const issues: ParseIssue[] = []

  list.forEach((raw, index) => {
    const row = raw as Record<string, unknown>
    const asText = (value: unknown) => (value == null ? '' : String(value).trim())
    const name = asText(row.nameEn) || asText(row.name) || asText(row.generic)
    if (!name) {
      issues.push({ line: index + 1, message: 'No name' })
      return
    }
    const strength = asText(row.strength)
    const formLabel = asText(row.formLabel) || asText(row.form)
    entries.push({
      code: asText(row.code) || deriveCode(name, strength),
      nameEn: name,
      nameJa: asText(row.nameJa),
      generic: asText(row.generic) || name,
      brandNames: Array.isArray(row.brandNames) ? row.brandNames.map(asText) : splitList(asText(row.brandNames)),
      classes: Array.isArray(row.classes) ? row.classes.map(asText) : splitList(asText(row.classes)),
      form: toForm(asText(row.form)),
      formLabel: formLabel || null,
      strength,
      unit: asText(row.unit) || 'unit',
      isControlled: row.isControlled === true,
      note: asText(row.note),
    })
  })

  return { entries, issues, ignoredColumns: [] }
}

function parseCsvFile(text: string): ParsedFile {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('The file is empty.')

  const { map, ignored } = buildHeaderMap(rows[0])
  const fields = [...map.values()]
  if (!fields.includes('nameEn') && !fields.includes('generic') && !fields.includes('nameKh')) {
    throw new Error('No name column found. Expected one of: Drug names, Name (English), Name (Khmer).')
  }

  const entries: CatalogEntry[] = []
  const issues: ParseIssue[] = []
  const seen = new Set<string>()

  rows.slice(1).forEach((cells, index) => {
    // +2: one for the header row, one because spreadsheets count from 1.
    const line = index + 2
    if (cells.every((cell) => !cell.trim())) return

    const row = {} as ParsedRow
    for (const [column, field] of map) row[field] = (cells[column] ?? '').trim()

    const name = row.nameEn || row.generic || row.nameKh
    if (!name) {
      issues.push({ line, message: 'No name — row skipped' })
      return
    }

    let code = row.code || deriveCode(name, row.strength ?? '')
    if (seen.has(code.toLowerCase())) {
      // Codes must be unique; suffix rather than drop the row.
      let n = 2
      while (seen.has(`${code}-${n}`.toLowerCase())) n += 1
      issues.push({ line, message: `Duplicate code "${code}" — imported as "${code}-${n}"` })
      code = `${code}-${n}`
    }
    seen.add(code.toLowerCase())

    entries.push({
      code,
      nameEn: row.nameEn || '',
      nameJa: row.nameJa || '',
      generic: row.generic || row.nameEn || '',
      brandNames: splitList(row.brandNames || ''),
      classes: splitList(row.classes || ''),
      form: toForm(row.form || ''),
      formLabel: row.form || null,
      strength: row.strength || '',
      unit: row.unit || 'unit',
      isControlled: false,
      note: row.note || '',
      nameKh: row.nameKh || '',
    } as CatalogEntry & { nameKh: string })
  })

  return { entries, issues, ignoredColumns: ignored }
}

/** A blank file in the exact shape the importer expects. */
export function importTemplateCsv(): string {
  return toCsv([
    [
      'Code',
      'Drug names',
      'Name (Khmer)',
      'Japanese names',
      'Generic',
      'Brand names',
      'Drug classes',
      'Dosage form',
      'Strength',
      'Unit',
      'Annotation',
    ],
    [
      'PARA-500MG',
      'Paracetamol',
      'ប៉ារ៉ាសេតាមុល',
      'アセトアミノフェン',
      'Paracetamol',
      'Panadol',
      'Analgesic; Antipyretic',
      'Tablet',
      '500 mg',
      'tablet',
      'Usable over 3 months old',
    ],
  ])
}
