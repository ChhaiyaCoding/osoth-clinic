/**
 * Plain calendar dates as `YYYY-MM-DD` strings.
 *
 * Expiry is a calendar fact, not an instant: a batch expiring "31 December"
 * expires on that date in the clinic's own timezone. `toISOString()` would
 * convert to UTC first and, at UTC+7, report the previous day for most of the
 * evening — so these helpers work from the local calendar throughout.
 */

export type IsoDate = string

export function toIsoDate(date: Date = new Date()): IsoDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(days: number, from: Date = new Date()): IsoDate {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** Whole days from today to `date`; negative once the date has passed. */
export function daysUntil(date: IsoDate, from: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, (m ?? 1) - 1, d ?? 1)
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

/** ISO dates sort correctly as plain strings, which keeps comparisons cheap. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}
