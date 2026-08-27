import { db, getSettings } from './db'
import { newId } from '../lib/id'
import { addDays, daysUntil, toIsoDate, type IsoDate } from '../lib/dates'
import type { Batch, Drug, Id, StockMove, StockMoveType } from './types'

/**
 * Stock, held as batches with their own expiry dates.
 *
 * The rule the whole module is built on: **`stockMoves` is the truth and
 * `Batch.qtyOnHand` is a cache.** Every change to a quantity writes a signed
 * ledger row in the same transaction as the cache update, so the two can never
 * diverge from a partial write — and `rebuildBatchQuantities()` can always
 * recompute the cache from the ledger if anything ever does go wrong.
 */

export type ExpiryStatus = 'expired' | 'expiring' | 'ok'

export interface ReceiveInput {
  drugId: Id
  lotNo: string
  expiryDate: IsoDate
  /** In the drug's own dispensing unit, already converted from packs. */
  quantity: number
  costPrice: number
  supplier?: string
  note?: string
}

export interface BatchWithDrug {
  batch: Batch
  drug: Drug
  status: ExpiryStatus
  daysLeft: number
}

export interface DrugStock {
  drug: Drug
  /** Total across live batches, in the drug's dispensing unit. */
  onHand: number
  batches: number
  /** Soonest expiry among batches still holding stock. */
  nextExpiry?: IsoDate
  status: ExpiryStatus
  isLow: boolean
}

export function expiryStatus(expiryDate: IsoDate, warningDays: number, today = new Date()): ExpiryStatus {
  const left = daysUntil(expiryDate, today)
  if (left < 0) return 'expired'
  return left <= warningDays ? 'expiring' : 'ok'
}

/** Live batches for a drug in FEFO order — first to expire, first to be used. */
export async function batchesForDrug(drugId: Id): Promise<Batch[]> {
  const rows = await db.batches.where('drugId').equals(drugId).toArray()
  return rows
    .filter((batch) => !batch.deletedAt)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.receivedAt.localeCompare(b.receivedAt))
}

/**
 * Record stock arriving. Creates the batch and its opening ledger row together,
 * so a batch can never exist without the movement that explains it.
 */
export async function receiveStock(input: ReceiveInput): Promise<Id> {
  if (input.quantity <= 0) throw new Error('Quantity must be greater than zero')

  const now = new Date().toISOString()
  const batchId = newId()

  await db.transaction('rw', db.batches, db.stockMoves, async () => {
    const batch: Batch = {
      id: batchId,
      drugId: input.drugId,
      lotNo: input.lotNo.trim(),
      expiryDate: input.expiryDate,
      qtyOnHand: input.quantity,
      costPrice: input.costPrice,
      supplier: input.supplier?.trim() || undefined,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.batches.add(batch)
    await db.stockMoves.add(move(batchId, input.drugId, 'in', input.quantity, input.note, now))
  })

  return batchId
}

function move(
  batchId: Id,
  drugId: Id,
  type: StockMoveType,
  qty: number,
  reason: string | undefined,
  at: string,
): StockMove {
  return {
    id: newId(),
    batchId,
    drugId,
    type,
    qty,
    reason: reason?.trim() || undefined,
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

/**
 * Correct a batch to a counted quantity — what a physical stock count produces.
 * The ledger records the *difference*, which is what makes the history readable
 * ("−3 on 12 March, reason: breakage") rather than a list of absolute values.
 */
export async function adjustBatch(batchId: Id, countedQty: number, reason: string): Promise<void> {
  if (countedQty < 0) throw new Error('Counted quantity cannot be negative')

  await db.transaction('rw', db.batches, db.stockMoves, async () => {
    const batch = await db.batches.get(batchId)
    if (!batch) throw new Error(`Batch ${batchId} not found`)

    const delta = countedQty - batch.qtyOnHand
    if (delta === 0) return

    const now = new Date().toISOString()
    await db.stockMoves.add(move(batchId, batch.drugId, 'adjust', delta, reason, now))
    await db.batches.update(batchId, { qtyOnHand: countedQty, updatedAt: now })
  })
}

/** Take an expired batch out of stock, leaving the reason in the ledger. */
export async function writeOffBatch(batchId: Id, reason: string): Promise<void> {
  await db.transaction('rw', db.batches, db.stockMoves, async () => {
    const batch = await db.batches.get(batchId)
    if (!batch) throw new Error(`Batch ${batchId} not found`)
    if (batch.qtyOnHand === 0) return

    const now = new Date().toISOString()
    await db.stockMoves.add(move(batchId, batch.drugId, 'expired', -batch.qtyOnHand, reason, now))
    await db.batches.update(batchId, { qtyOnHand: 0, updatedAt: now })
  })
}

export async function movesForDrug(drugId: Id): Promise<StockMove[]> {
  const rows = await db.stockMoves.where('drugId').equals(drugId).toArray()
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

/**
 * Recompute every `qtyOnHand` from the ledger and report how many were wrong.
 *
 * This is the promise the append-only design makes good on: if a cached total
 * is ever corrupted, the movements can always rebuild it.
 */
export async function rebuildBatchQuantities(): Promise<{ checked: number; corrected: number }> {
  return db.transaction('rw', db.batches, db.stockMoves, async () => {
    const [batches, moves] = await Promise.all([db.batches.toArray(), db.stockMoves.toArray()])

    const totals = new Map<Id, number>()
    for (const m of moves) {
      if (m.deletedAt) continue
      totals.set(m.batchId, (totals.get(m.batchId) ?? 0) + m.qty)
    }

    let corrected = 0
    const now = new Date().toISOString()
    for (const batch of batches) {
      const truth = totals.get(batch.id) ?? 0
      if (truth === batch.qtyOnHand) continue
      await db.batches.update(batch.id, { qtyOnHand: truth, updatedAt: now })
      corrected += 1
    }
    return { checked: batches.length, corrected }
  })
}

/** Stock rolled up per drug, for the stock list. */
export async function drugStockList(query = ''): Promise<DrugStock[]> {
  const settings = await getSettings()
  const [drugs, batches] = await Promise.all([db.drugs.toArray(), db.batches.toArray()])

  const byDrug = new Map<Id, Batch[]>()
  for (const batch of batches) {
    if (batch.deletedAt) continue
    const list = byDrug.get(batch.drugId)
    if (list) list.push(batch)
    else byDrug.set(batch.drugId, [batch])
  }

  const rows: DrugStock[] = []
  for (const drug of drugs) {
    if (drug.deletedAt || drug.isArchived) continue
    const list = byDrug.get(drug.id) ?? []
    const withStock = list.filter((batch) => batch.qtyOnHand > 0)
    const onHand = withStock.reduce((sum, batch) => sum + batch.qtyOnHand, 0)

    // Only batches that still hold stock can expire in a way that matters.
    const nextExpiry = withStock
      .map((batch) => batch.expiryDate)
      .sort()
      .at(0)

    rows.push({
      drug,
      onHand,
      batches: withStock.length,
      nextExpiry,
      status: nextExpiry ? expiryStatus(nextExpiry, settings.expiryWarningDays) : 'ok',
      isLow: onHand <= drug.reorderLevel,
    })
  }

  if (!query.trim()) return rows
  const { normalize } = await import('../lib/search')
  const q = normalize(query)
  return rows.filter((row) =>
    [row.drug.code, row.drug.nameKh, row.drug.nameEn, row.drug.nameJa, row.drug.generic]
      .filter(Boolean)
      .some((field) => normalize(field).includes(q)),
  )
}

export interface StockAlerts {
  expired: BatchWithDrug[]
  expiring: BatchWithDrug[]
  low: DrugStock[]
  warningDays: number
}

/**
 * The three things worth acting on: stock that has expired, stock about to,
 * and drugs at or below their reorder level.
 */
export async function stockAlerts(): Promise<StockAlerts> {
  const settings = await getSettings()
  const today = new Date()
  const [batches, drugs] = await Promise.all([db.batches.toArray(), db.drugs.toArray()])
  const drugById = new Map(drugs.map((drug) => [drug.id, drug]))

  const expired: BatchWithDrug[] = []
  const expiring: BatchWithDrug[] = []

  for (const batch of batches) {
    if (batch.deletedAt || batch.qtyOnHand <= 0) continue
    const drug = drugById.get(batch.drugId)
    if (!drug || drug.deletedAt) continue

    const status = expiryStatus(batch.expiryDate, settings.expiryWarningDays, today)
    if (status === 'ok') continue
    const entry: BatchWithDrug = { batch, drug, status, daysLeft: daysUntil(batch.expiryDate, today) }
    ;(status === 'expired' ? expired : expiring).push(entry)
  }

  const byExpiry = (a: BatchWithDrug, b: BatchWithDrug) =>
    a.batch.expiryDate.localeCompare(b.batch.expiryDate)
  expired.sort(byExpiry)
  expiring.sort(byExpiry)

  // Only drugs the clinic has asked to be warned about, i.e. with a reorder
  // level set — otherwise every drug never stocked would raise an alert.
  const low = (await drugStockList()).filter((row) => row.drug.reorderLevel > 0 && row.isLow)

  return { expired, expiring, low, warningDays: settings.expiryWarningDays }
}

export async function setExpiryWarningDays(days: number): Promise<void> {
  const settings = await getSettings()
  await db.settings.put({ ...settings, expiryWarningDays: days, updatedAt: new Date().toISOString() })
}

/** Default expiry a form can offer: today plus two years, a common shelf life. */
export function defaultExpiryDate(): IsoDate {
  return addDays(730)
}

export { toIsoDate, daysUntil }
