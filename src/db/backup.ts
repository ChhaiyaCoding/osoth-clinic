import { db, getSettings, DEFAULT_SETTINGS } from './db'
import { drugSearchTokens } from '../lib/search'
import type { DrugRow, PatientRow } from './db'
import type { Batch, Dispense, Prescription, Settings, StockMove, Visit } from './types'

/**
 * Whole-database export and restore.
 *
 * The app keeps everything in one browser's IndexedDB, which the browser is
 * free to evict and which no other device can see. A file the clinic controls
 * is the only real safety net, so this is deliberately plain: one JSON file,
 * readable, restorable on any device.
 */

export const BACKUP_FORMAT = 'clinic-pharmacy-backup'
export const BACKUP_FORMAT_VERSION = 1
/** Must track the Dexie version in db.ts. */
export const SCHEMA_VERSION = 4

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  schemaVersion: number
  exportedAt: string
  counts: Record<string, number>
  data: {
    drugs: DrugRow[]
    batches: Batch[]
    stockMoves: StockMove[]
    patients: PatientRow[]
    visits: Visit[]
    prescriptions: Prescription[]
    dispenses: Dispense[]
    settings: Settings[]
  }
}

export type RestoreMode = 'replace' | 'merge'

export interface RestoreResult {
  mode: RestoreMode
  added: number
  updated: number
  kept: number
  removed: number
}

/** `searchText` is derived from the other fields, so it is not worth storing. */
function stripDerived<T extends { searchText?: unknown }>(rows: T[]): Omit<T, 'searchText'>[] {
  return rows.map(({ searchText: _ignored, ...rest }) => rest)
}

export async function createBackup(): Promise<BackupFile> {
  const [drugs, batches, stockMoves, patients, visits, prescriptions, dispenses, settings] =
    await db.transaction(
      'r',
      [db.drugs, db.batches, db.stockMoves, db.patients, db.visits, db.prescriptions, db.dispenses, db.settings],
      () =>
        Promise.all([
          db.drugs.toArray(),
          db.batches.toArray(),
          db.stockMoves.toArray(),
          db.patients.toArray(),
          db.visits.toArray(),
          db.prescriptions.toArray(),
          db.dispenses.toArray(),
          db.settings.toArray(),
        ]),
    )

  const data = {
    drugs: stripDerived(drugs) as DrugRow[],
    batches,
    stockMoves,
    patients: stripDerived(patients) as PatientRow[],
    visits,
    prescriptions,
    dispenses,
    settings,
  }

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])),
    data,
  }
}

export function backupFileName(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  return `osoth-backup-${stamp}.json`
}

/**
 * Hand the backup to the user.
 *
 * On a phone the share sheet is the route that actually works — it offers Save
 * to Files, AirDrop and email, and it behaves inside an installed PWA where a
 * plain download link often does not. Desktop falls back to a download.
 */
export async function saveBackupToDevice(backup: BackupFile): Promise<'shared' | 'downloaded'> {
  const json = JSON.stringify(backup, null, 1)
  const name = backupFileName()
  const file = new File([json], name, { type: 'application/json' })

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      await recordBackupTaken()
      return 'shared'
    } catch (error) {
      // A user who taps Cancel is not an error worth surfacing, but any other
      // failure should still get the download fallback below.
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  await recordBackupTaken()
  return 'downloaded'
}

async function recordBackupTaken(): Promise<void> {
  const now = new Date().toISOString()
  const settings = await getSettings()
  await db.settings.put({ ...settings, lastBackupAt: now, updatedAt: now })
}

export async function getLastBackupAt(): Promise<string | undefined> {
  return (await getSettings()).lastBackupAt
}

export class BackupFormatError extends Error {}

/** Parse and sanity-check a file the user picked. Throws with a readable reason. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new BackupFormatError('notJson')
  }

  const backup = parsed as Partial<BackupFile>
  if (backup?.format !== BACKUP_FORMAT) throw new BackupFormatError('notABackup')
  if (typeof backup.formatVersion !== 'number' || backup.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError('tooNew')
  }
  if (!backup.data || typeof backup.data !== 'object') throw new BackupFormatError('noData')
  if (!Array.isArray(backup.data.drugs)) throw new BackupFormatError('noData')

  return backup as BackupFile
}

/**
 * Restore a backup.
 *
 * 'replace' makes the database match the file exactly — the meaning of
 * restoring after data loss. 'merge' keeps whichever copy of a record was
 * edited more recently, which is what combining two devices needs.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<RestoreResult> {
  const result: RestoreResult = { mode, added: 0, updated: 0, kept: 0, removed: 0 }
  const tables = [db.drugs, db.batches, db.stockMoves, db.patients, db.visits, db.prescriptions, db.dispenses, db.settings]

  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      for (const table of tables) {
        result.removed += await table.count()
        await table.clear()
      }
    }

    const existingDrugs = mode === 'merge' ? await db.drugs.toArray() : []
    const byId = new Map(existingDrugs.map((drug) => [drug.id, drug]))

    for (const drug of backup.data.drugs ?? []) {
      const row: DrugRow = { ...drug, searchText: drugSearchTokens(drug) }
      const current = byId.get(drug.id)

      if (!current) {
        await db.drugs.put(row)
        result.added += 1
        continue
      }
      // Newer wins. Equal timestamps mean the same edit, so leave it alone.
      if ((drug.updatedAt ?? '') > (current.updatedAt ?? '')) {
        await db.drugs.put(row)
        result.updated += 1
      } else {
        result.kept += 1
      }
    }

    // The remaining tables have no UI yet; a straight put is the whole story.
    await db.batches.bulkPut(backup.data.batches ?? [])
    await db.stockMoves.bulkPut(backup.data.stockMoves ?? [])
    await db.patients.bulkPut(
      (backup.data.patients ?? []).map((patient) => ({
        ...patient,
        searchText: patient.searchText ?? [],
      })),
    )
    await db.visits.bulkPut(backup.data.visits ?? [])
    await db.prescriptions.bulkPut(backup.data.prescriptions ?? [])
    await db.dispenses.bulkPut(backup.data.dispenses ?? [])

    const settings = backup.data.settings ?? []
    if (settings.length > 0) await db.settings.bulkPut(settings)
    else if (mode === 'replace') await db.settings.put(DEFAULT_SETTINGS)
  })

  return result
}

export interface StorageStatus {
  /** True when the browser promised not to evict this origin under pressure. */
  persisted: boolean
  usageBytes?: number
  quotaBytes?: number
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  const estimate = await navigator.storage?.estimate?.()
  return { persisted, usageBytes: estimate?.usage, quotaBytes: estimate?.quota }
}
