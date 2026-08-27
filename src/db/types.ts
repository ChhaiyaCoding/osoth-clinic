/**
 * The full domain model for the clinic pharmacy.
 *
 * Only `Drug` has a UI in phase 1, but every table is declared up front so the
 * later phases (batches, prescriptions, dispensing) never need a destructive
 * schema migration. Two rules hold everywhere:
 *
 *  - ids are UUIDs, not auto-increment numbers, so records stay unique if the
 *    app ever syncs between devices;
 *  - every record carries `createdAt` / `updatedAt` as ISO strings, which a
 *    future sync needs for conflict resolution.
 */

export type Id = string

export interface BaseRecord {
  id: Id
  createdAt: string
  updatedAt: string
  /** Soft delete. Rows are never hard-deleted so a future sync can propagate removals. */
  deletedAt?: string | null
}

/** Dosage form. Stored as a stable key; the label is translated at render time. */
export type DrugForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'suspension'
  | 'injection'
  | 'infusion'
  | 'powder'
  | 'cream'
  | 'ointment'
  | 'drops'
  | 'inhaler'
  | 'spray'
  | 'patch'
  | 'solution'
  | 'suppository'
  | 'other'

export const DRUG_FORMS: DrugForm[] = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'infusion',
  'powder',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'spray',
  'patch',
  'solution',
  'suppository',
  'other',
]

/**
 * The clinical monograph, modelled on the section list a Medscape drug entry
 * uses. Every section is the same shape — a list of headed blocks — so one
 * renderer and one editor cover all eight. The two sections that need more get
 * it from dedicated fields rather than a bespoke shape:
 *
 *  - Dosage blocks carry an `audience` so the page can split adult / pediatric.
 *  - Pregnancy carries `pregnancyCategory` and `lactation` on the monograph.
 */
export const MONOGRAPH_SECTIONS = [
  'dosage',
  'interactions',
  'adverseEffects',
  'warnings',
  'pregnancy',
  'pharmacology',
  'administration',
  'formulary',
] as const

export type MonographSectionKey = (typeof MONOGRAPH_SECTIONS)[number]

export type DoseAudience = 'adult' | 'pediatric'

/**
 * One headed group of lines, e.g. heading "Contraindications" with the single
 * item "Hypersensitivity", or heading "OINTMENT" with items 5g / 42.5g / 56.6g.
 */
export interface MonographBlock {
  id: Id
  heading: string
  items: string[]
  /** Dosage section only — which patient group this block applies to. */
  audience?: DoseAudience
}

/** FDA-style pregnancy risk letters, plus "not available". */
export const PREGNANCY_CATEGORIES = ['A', 'B', 'C', 'D', 'X', 'NA'] as const
export type PregnancyCategory = (typeof PREGNANCY_CATEGORIES)[number]

export type Monograph = {
  [K in MonographSectionKey]: MonographBlock[]
} & {
  pregnancyCategory: PregnancyCategory
  lactation: string
}

export interface Drug extends BaseRecord {
  /** Short human code used on shelves and in search, e.g. "PARA500". */
  code: string
  nameKh: string
  nameEn: string
  /**
   * Japanese name. This clinic works from a Japan Heart medicine list where the
   * Japanese name is the column staff cross-check against, so it is a name in
   * its own right rather than a brand.
   */
  nameJa: string
  /** International non-proprietary name, e.g. "Paracetamol". */
  generic: string
  /** Trade names, e.g. ["Aciphex", "Aciphex Sprinkle"]. */
  brandNames: string[]
  /** Therapeutic classes, e.g. ["Proton Pump Inhibitors"]. */
  classes: string[]
  /** Prescription-only vs over-the-counter. */
  rxStatus: 'rx' | 'otc'
  /** Clinical reference content. Always present; sections may be empty. */
  monograph: Monograph
  /**
   * Where the monograph text came from, when it was not typed by the clinic —
   * e.g. a bundled starter set. Present means "not written here", which the UI
   * surfaces so nobody mistakes imported text for the clinic's own protocol.
   */
  monographSource?: string
  /**
   * Set when a pharmacist has checked an imported monograph against the
   * manufacturer's labeling. Until then the UI shows an unverified banner.
   */
  monographReviewedAt?: string | null
  form: DrugForm
  /**
   * The dosage form exactly as the source list words it ("Prefilled syringe",
   * "Eye / Ear drop"). `form` is the coarse enum used for grouping; this keeps
   * the clinical wording that the enum would otherwise flatten away.
   */
  formLabel?: string
  /** Free text so odd cases fit: "500mg", "250mg/5ml", "0.9%". */
  strength: string
  /** Smallest dispensable unit — what stock is counted in. */
  unit: string
  /** How many `unit`s come in one purchased pack. Used when receiving stock. */
  packSize: number
  /** Reorder point, in `unit`s. Stock at or below this raises a low-stock alert. */
  reorderLevel: number
  costPrice: number
  sellPrice: number
  note?: string
  /** Narcotics / psychotropics that need stricter records. */
  isControlled: boolean
  /** Hidden from pickers without losing its history. */
  isArchived: boolean
}

/** A physical lot of one drug. Expiry and stock live here, never on `Drug`. */
export interface Batch extends BaseRecord {
  drugId: Id
  lotNo: string
  /** ISO date (YYYY-MM-DD). */
  expiryDate: string
  qtyOnHand: number
  costPrice: number
  supplier?: string
  receivedAt: string
}

export type StockMoveType = 'in' | 'dispense' | 'adjust' | 'expired' | 'return'

/**
 * Append-only stock ledger. `Batch.qtyOnHand` is a cached running total; this
 * table is the source of truth and can always rebuild it.
 */
export interface StockMove extends BaseRecord {
  batchId: Id
  drugId: Id
  type: StockMoveType
  /** Signed: positive adds to stock, negative removes. */
  qty: number
  /** Id of the dispense / purchase that caused the move, when there is one. */
  refId?: Id
  reason?: string
  occurredAt: string
}

export interface Patient extends BaseRecord {
  code: string
  nameKh: string
  nameEn: string
  sex: 'male' | 'female' | 'other'
  /** ISO date (YYYY-MM-DD). */
  dob?: string
  phone?: string
  address?: string
  allergies: string[]
  note?: string
}

export interface Visit extends BaseRecord {
  patientId: Id
  visitedAt: string
  symptoms?: string
  diagnosis?: string
  note?: string
}

export interface PrescriptionItem {
  drugId: Id
  /** Amount per administration, in `Drug.unit`s, e.g. 1 tablet. */
  dose: number
  /** Administrations per day. */
  timesPerDay: number
  days: number
  /** dose x timesPerDay x days, stored so edits to the drug can't rewrite history. */
  qty: number
  instruction?: string
}

export interface Prescription extends BaseRecord {
  visitId: Id
  patientId: Id
  prescribedAt: string
  items: PrescriptionItem[]
  note?: string
}

export interface DispenseLine {
  drugId: Id
  batchId: Id
  qty: number
  sellPrice: number
}

export interface Dispense extends BaseRecord {
  prescriptionId?: Id
  patientId?: Id
  dispensedAt: string
  lines: DispenseLine[]
  total: number
  note?: string
}

/** Single-row table holding app-wide settings. */
export interface Settings {
  id: 'app'
  clinicNameKh: string
  clinicNameEn: string
  address?: string
  phone?: string
  currency: string
  /** Days before expiry at which a batch starts showing as "expiring soon". */
  expiryWarningDays: number
  lastBackupAt?: string
  updatedAt: string
}
