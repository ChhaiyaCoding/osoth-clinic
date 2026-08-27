import Dexie, { type EntityTable } from 'dexie'
import type {
  Batch,
  Dispense,
  Drug,
  Monograph,
  Patient,
  Prescription,
  Settings,
  StockMove,
  Visit,
} from './types'

/**
 * How a drug is stored. `searchText` is a derived multi-entry index maintained
 * by `db/drugs.ts`, kept off the domain type so nothing else has to know about it.
 */
export interface DrugRow extends Drug {
  searchText: string[]
}

/** Same idea for patients (phase 3). */
export interface PatientRow extends Patient {
  searchText: string[]
}

/**
 * All tables are declared in version 1 even though phase 1 only writes to
 * `drugs` — adding a store later would force a version bump on every install,
 * and there is no data to preserve yet.
 *
 * Index notes: `searchText` is a multi-entry index (`*searchText`) holding the
 * lowercased Khmer, English, generic and code tokens of a drug, so one query
 * matches a term in any language. See `lib/search.ts`.
 */
export class ClinicDb extends Dexie {
  drugs!: EntityTable<DrugRow, 'id'>
  batches!: EntityTable<Batch, 'id'>
  stockMoves!: EntityTable<StockMove, 'id'>
  patients!: EntityTable<PatientRow, 'id'>
  visits!: EntityTable<Visit, 'id'>
  prescriptions!: EntityTable<Prescription, 'id'>
  dispenses!: EntityTable<Dispense, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('clinic-pharmacy')

    this.version(1).stores({
      drugs: 'id, code, nameKh, nameEn, generic, form, isArchived, deletedAt, updatedAt, *searchText',
      batches: 'id, drugId, expiryDate, lotNo, deletedAt, updatedAt, [drugId+expiryDate]',
      stockMoves: 'id, batchId, drugId, type, occurredAt, refId',
      patients: 'id, code, nameKh, nameEn, phone, deletedAt, updatedAt, *searchText',
      visits: 'id, patientId, visitedAt, deletedAt',
      prescriptions: 'id, visitId, patientId, prescribedAt, deletedAt',
      dispenses: 'id, prescriptionId, patientId, dispensedAt, deletedAt',
      settings: 'id',
    })

    // v2 added the monograph plus brand names, classes and Rx status. None of
    // them are indexed, so the store definitions are unchanged and only the
    // existing rows need backfilling with defaults.
    this.version(2).upgrade((tx) =>
      tx
        .table<DrugRow>('drugs')
        .toCollection()
        .modify((drug) => {
          drug.brandNames ??= []
          drug.classes ??= []
          drug.rxStatus ??= 'rx'
          drug.monograph ??= emptyMonograph()
        }),
    )

    // v3 added the Japanese name, carried by the ACMC source list.
    this.version(3).upgrade((tx) =>
      tx
        .table<DrugRow>('drugs')
        .toCollection()
        .modify((drug) => {
          drug.nameJa ??= ''
        }),
    )

    // v4 records where a monograph came from and whether it has been checked.
    // Anything already in the database was typed by the clinic, so it counts as
    // its own source and needs no review banner.
    this.version(4).upgrade((tx) =>
      tx
        .table<DrugRow>('drugs')
        .toCollection()
        .modify((drug) => {
          drug.monographSource ??= undefined
          drug.monographReviewedAt ??= null
        }),
    )
  }
}

/** A monograph with every section present and empty. */
export function emptyMonograph(): Monograph {
  return {
    dosage: [],
    interactions: [],
    adverseEffects: [],
    warnings: [],
    pregnancy: [],
    pharmacology: [],
    administration: [],
    formulary: [],
    pregnancyCategory: 'NA',
    lactation: '',
  }
}

export const db = new ClinicDb()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  clinicNameKh: 'គ្លីនិករបស់ខ្ញុំ',
  clinicNameEn: 'My Clinic',
  currency: 'USD',
  expiryWarningDays: 90,
  updatedAt: new Date(0).toISOString(),
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

/**
 * Ask the browser to keep this origin's storage out of automatic eviction.
 * Best-effort: Safari in particular may refuse, which is exactly why the app
 * also needs manual export (phase 5).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
