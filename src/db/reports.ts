import { db } from './db'
import { toIsoDate, addDays, daysUntil, type IsoDate } from '../lib/dates'
import { expiryStatus } from './stock'
import { getSettings } from './db'
import type { Drug, Id, StockMoveType } from './types'

/**
 * Reporting over the records the earlier phases already produce.
 *
 * Nothing is aggregated at write time — every figure here is derived from the
 * dispense records and the movement ledger on demand. That keeps a single
 * source of truth: a corrected stock count or a restored backup changes the
 * reports automatically, with no totals to rebuild.
 */

export interface Period {
  from: IsoDate
  /** Inclusive. */
  to: IsoDate
}

export type PeriodPreset = 'today' | 'week' | 'month' | 'year'

export function presetPeriod(preset: PeriodPreset, today = new Date()): Period {
  const to = toIsoDate(today)
  if (preset === 'today') return { from: to, to }
  if (preset === 'week') return { from: addDays(-6, today), to }
  if (preset === 'month') return { from: addDays(-29, today), to }
  return { from: addDays(-364, today), to }
}

/** Dispense timestamps are instants; reports are about local calendar days. */
function localDay(iso: string): IsoDate {
  return toIsoDate(new Date(iso))
}

function inPeriod(iso: string, period: Period): boolean {
  const day = localDay(iso)
  return day >= period.from && day <= period.to
}

export interface SalesSummary {
  dispenses: number
  lines: number
  units: number
  revenue: number
  cost: number
  profit: number
  /** Profit as a share of revenue; undefined when nothing was sold. */
  margin?: number
}

export interface DrugSales {
  drug: Drug
  units: number
  revenue: number
  cost: number
  profit: number
}

export interface DayPoint {
  date: IsoDate
  revenue: number
  units: number
}

export interface MovementSummary {
  byType: Record<StockMoveType, number>
  received: number
  dispensed: number
  writtenOff: number
}

export interface StockValuation {
  batches: number
  units: number
  costValue: number
  retailValue: number
  expiredValue: number
  expiringValue: number
}

export interface ReportBundle {
  period: Period
  sales: SalesSummary
  daily: DayPoint[]
  top: DrugSales[]
  movements: MovementSummary
  valuation: StockValuation
}

/**
 * Cost of goods is taken from the *batch each line came from*, not from the
 * drug's current cost price — the point of batch tracking is that what was
 * dispensed in March cost what March's delivery cost.
 */
async function costPerUnitByBatch(): Promise<Map<Id, number>> {
  const batches = await db.batches.toArray()
  return new Map(batches.map((batch) => [batch.id, batch.costPrice]))
}

export async function buildReport(period: Period): Promise<ReportBundle> {
  const [dispenses, moves, batches, drugs, settings] = await Promise.all([
    db.dispenses.toArray(),
    db.stockMoves.toArray(),
    db.batches.toArray(),
    db.drugs.toArray(),
    getSettings(),
  ])

  const drugById = new Map(drugs.map((drug) => [drug.id, drug]))
  const batchCost = await costPerUnitByBatch()

  const sales: SalesSummary = { dispenses: 0, lines: 0, units: 0, revenue: 0, cost: 0, profit: 0 }
  const perDay = new Map<IsoDate, DayPoint>()
  const perDrug = new Map<Id, DrugSales>()

  for (const dispense of dispenses) {
    if (dispense.deletedAt || !inPeriod(dispense.dispensedAt, period)) continue
    sales.dispenses += 1
    const day = localDay(dispense.dispensedAt)

    for (const line of dispense.lines) {
      const drug = drugById.get(line.drugId)
      // A drug deleted since the sale still has to appear in the figures.
      const unitCost = batchCost.get(line.batchId) ?? drug?.costPrice ?? 0
      const revenue = line.qty * line.sellPrice
      const cost = line.qty * unitCost

      sales.lines += 1
      sales.units += line.qty
      sales.revenue += revenue
      sales.cost += cost

      const point = perDay.get(day) ?? { date: day, revenue: 0, units: 0 }
      point.revenue += revenue
      point.units += line.qty
      perDay.set(day, point)

      if (drug) {
        const entry = perDrug.get(drug.id) ?? { drug, units: 0, revenue: 0, cost: 0, profit: 0 }
        entry.units += line.qty
        entry.revenue += revenue
        entry.cost += cost
        entry.profit = entry.revenue - entry.cost
        perDrug.set(drug.id, entry)
      }
    }
  }

  sales.profit = sales.revenue - sales.cost
  sales.margin = sales.revenue > 0 ? sales.profit / sales.revenue : undefined

  // Every day in the range, including the quiet ones — gaps in a chart read as
  // missing data, whereas a zero reads as a quiet day.
  const daily: DayPoint[] = []
  for (let day = period.from; day <= period.to; day = addDays(1, new Date(`${day}T12:00:00`))) {
    daily.push(perDay.get(day) ?? { date: day, revenue: 0, units: 0 })
  }

  const byType = { in: 0, dispense: 0, adjust: 0, expired: 0, return: 0 } as Record<StockMoveType, number>
  for (const move of moves) {
    if (move.deletedAt || !inPeriod(move.occurredAt, period)) continue
    byType[move.type] = (byType[move.type] ?? 0) + move.qty
  }

  const valuation: StockValuation = {
    batches: 0,
    units: 0,
    costValue: 0,
    retailValue: 0,
    expiredValue: 0,
    expiringValue: 0,
  }
  for (const batch of batches) {
    if (batch.deletedAt || batch.qtyOnHand <= 0) continue
    const drug = drugById.get(batch.drugId)
    if (!drug || drug.deletedAt) continue

    const cost = batch.qtyOnHand * batch.costPrice
    valuation.batches += 1
    valuation.units += batch.qtyOnHand
    valuation.costValue += cost
    valuation.retailValue += batch.qtyOnHand * drug.sellPrice

    const status = expiryStatus(batch.expiryDate, settings.expiryWarningDays)
    if (status === 'expired') valuation.expiredValue += cost
    else if (status === 'expiring') valuation.expiringValue += cost
  }

  const top = [...perDrug.values()].sort((a, b) => b.units - a.units)

  return {
    period,
    sales,
    daily,
    top,
    movements: {
      byType,
      received: byType.in,
      dispensed: Math.abs(byType.dispense),
      writtenOff: Math.abs(byType.expired),
    },
    valuation,
  }
}

/** Flat rows for a spreadsheet: one line per medicine sold in the period. */
export function reportRows(report: ReportBundle, lang: 'km' | 'en'): (string | number)[][] {
  const name = (drug: Drug) =>
    (lang === 'km' ? drug.nameKh || drug.nameEn : drug.nameEn || drug.nameKh) || drug.code

  return [
    ['Code', 'Medicine', 'Unit', 'Units dispensed', 'Revenue', 'Cost', 'Profit'],
    ...report.top.map((row) => [
      row.drug.code,
      name(row.drug),
      row.drug.unit,
      row.units,
      row.revenue.toFixed(2),
      row.cost.toFixed(2),
      row.profit.toFixed(2),
    ]),
    [],
    ['Period', `${report.period.from} to ${report.period.to}`],
    ['Dispenses', report.sales.dispenses],
    ['Units', report.sales.units],
    ['Revenue', report.sales.revenue.toFixed(2)],
    ['Cost', report.sales.cost.toFixed(2)],
    ['Profit', report.sales.profit.toFixed(2)],
    [],
    ['Stock value (cost)', report.valuation.costValue.toFixed(2)],
    ['Stock value (retail)', report.valuation.retailValue.toFixed(2)],
    ['Expired stock value', report.valuation.expiredValue.toFixed(2)],
    ['Expiring stock value', report.valuation.expiringValue.toFixed(2)],
  ]
}

export { daysUntil }
