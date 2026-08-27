import { db } from './db'
import { newId } from '../lib/id'
import { toIsoDate } from '../lib/dates'
import { batchesForDrug } from './stock'
import type {
  Batch,
  Dispense,
  DispenseLine,
  Drug,
  Id,
  Prescription,
  PrescriptionItem,
  StockMove,
  Visit,
} from './types'

/**
 * Turning a prescription into stock leaving the shelf.
 *
 * Two rules drive everything here:
 *
 *  - **FEFO** — first to expire, first out, so short-dated stock is used before
 *    it becomes waste.
 *  - **Expired stock is never allocated.** A batch past its date is invisible to
 *    the allocator no matter how much is on it; it has to be written off.
 */

export interface Allocation {
  batch: Batch
  qty: number
}

export interface AllocationResult {
  lines: Allocation[]
  /** How much of the request could not be met from in-date stock. */
  shortfall: number
  available: number
}

/** Walk in-date batches in expiry order, taking from each until satisfied. */
export function allocateFefo(batches: Batch[], wanted: number, today = toIsoDate()): AllocationResult {
  const usable = batches
    .filter((batch) => batch.qtyOnHand > 0 && batch.expiryDate >= today)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.receivedAt.localeCompare(b.receivedAt))

  const available = usable.reduce((sum, batch) => sum + batch.qtyOnHand, 0)
  const lines: Allocation[] = []
  let left = wanted

  for (const batch of usable) {
    if (left <= 0) break
    const take = Math.min(batch.qtyOnHand, left)
    lines.push({ batch, qty: take })
    left -= take
  }

  return { lines, shortfall: Math.max(0, left), available }
}

export async function allocateForDrug(drugId: Id, wanted: number): Promise<AllocationResult> {
  return allocateFefo(await batchesForDrug(drugId), wanted)
}

/** dose × times per day × days — the arithmetic staff would otherwise do by hand. */
export function quantityFor(item: Pick<PrescriptionItem, 'dose' | 'timesPerDay' | 'days'>): number {
  return Math.ceil(item.dose * item.timesPerDay * item.days)
}

export interface DispenseDraftItem {
  drug: Drug
  item: PrescriptionItem
  allocation: AllocationResult
}

export interface RecordDispenseInput {
  patientId?: Id
  visit?: { symptoms?: string; diagnosis?: string; note?: string }
  items: { drugId: Id; item: PrescriptionItem; sellPrice: number }[]
  note?: string
}

export interface DispenseResult {
  dispenseId: Id
  prescriptionId?: Id
  visitId?: Id
  total: number
}

/**
 * Write the whole encounter — visit, prescription, dispense, and the stock
 * movements — in one transaction.
 *
 * Allocation is recomputed here rather than trusted from the UI: between the
 * screen rendering and the button being pressed, another dispense may have
 * taken the same stock. If anything no longer fits, the whole transaction
 * aborts rather than dispensing a partial prescription silently.
 */
export async function recordDispense(input: RecordDispenseInput): Promise<DispenseResult> {
  const now = new Date().toISOString()

  return db.transaction(
    'rw',
    [db.visits, db.prescriptions, db.dispenses, db.batches, db.stockMoves],
    async () => {
      let visitId: Id | undefined
      let prescriptionId: Id | undefined

      if (input.patientId) {
        visitId = newId()
        const visit: Visit = {
          id: visitId,
          patientId: input.patientId,
          visitedAt: now,
          symptoms: input.visit?.symptoms?.trim() || undefined,
          diagnosis: input.visit?.diagnosis?.trim() || undefined,
          note: input.visit?.note?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        await db.visits.add(visit)

        prescriptionId = newId()
        const prescription: Prescription = {
          id: prescriptionId,
          visitId,
          patientId: input.patientId,
          prescribedAt: now,
          items: input.items.map((entry) => entry.item),
          note: input.note?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        await db.prescriptions.add(prescription)
      }

      const dispenseId = newId()
      const lines: DispenseLine[] = []
      const moves: StockMove[] = []
      let total = 0

      for (const entry of input.items) {
        const batches = await batchesForDrug(entry.drugId)
        const { lines: allocation, shortfall } = allocateFefo(batches, entry.item.qty)
        if (shortfall > 0) {
          // Aborts the transaction: nothing is written, nothing half-dispensed.
          throw new InsufficientStockError(entry.drugId, shortfall)
        }

        for (const part of allocation) {
          lines.push({
            drugId: entry.drugId,
            batchId: part.batch.id,
            qty: part.qty,
            sellPrice: entry.sellPrice,
          })
          total += part.qty * entry.sellPrice

          await db.batches.update(part.batch.id, {
            qtyOnHand: part.batch.qtyOnHand - part.qty,
            updatedAt: now,
          })
          moves.push({
            id: newId(),
            batchId: part.batch.id,
            drugId: entry.drugId,
            type: 'dispense',
            qty: -part.qty,
            refId: dispenseId,
            occurredAt: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
        }
      }

      const dispense: Dispense = {
        id: dispenseId,
        prescriptionId,
        patientId: input.patientId,
        dispensedAt: now,
        lines,
        total,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await db.dispenses.add(dispense)
      await db.stockMoves.bulkAdd(moves)

      return { dispenseId, prescriptionId, visitId, total }
    },
  )
}

export class InsufficientStockError extends Error {
  // Written as plain fields rather than parameter properties, which the
  // project's `erasableSyntaxOnly` setting disallows.
  drugId: Id
  shortfall: number

  constructor(drugId: Id, shortfall: number) {
    super(`Not enough stock for ${drugId}: short by ${shortfall}`)
    this.name = 'InsufficientStockError'
    this.drugId = drugId
    this.shortfall = shortfall
  }
}

export interface VisitHistoryEntry {
  visit: Visit
  prescription?: Prescription
  dispense?: Dispense
}

/** A patient's encounters, newest first. */
export async function historyForPatient(patientId: Id): Promise<VisitHistoryEntry[]> {
  const [visits, prescriptions, dispenses] = await Promise.all([
    db.visits.where('patientId').equals(patientId).toArray(),
    db.prescriptions.where('patientId').equals(patientId).toArray(),
    db.dispenses.where('patientId').equals(patientId).toArray(),
  ])

  const byVisit = new Map(prescriptions.map((p) => [p.visitId, p]))
  const byPrescription = new Map(dispenses.map((d) => [d.prescriptionId, d]))

  return visits
    .filter((visit) => !visit.deletedAt)
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
    .map((visit) => {
      const prescription = byVisit.get(visit.id)
      return {
        visit,
        prescription,
        dispense: prescription ? byPrescription.get(prescription.id) : undefined,
      }
    })
}

export async function recentDispenses(limit = 30): Promise<Dispense[]> {
  const rows = await db.dispenses.toArray()
  return rows
    .filter((row) => !row.deletedAt)
    .sort((a, b) => b.dispensedAt.localeCompare(a.dispensedAt))
    .slice(0, limit)
}
