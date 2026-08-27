import { useTranslation } from 'react-i18next'
import { daysUntil } from '../lib/dates'
import type { ExpiryStatus } from '../db/stock'

const TONE: Record<ExpiryStatus, string> = {
  expired: 'bg-danger-soft text-danger-ink',
  expiring: 'bg-warn-soft text-warn-ink',
  ok: 'bg-surface-2 text-ink-2',
}

/**
 * Expiry shown as remaining time, not just a date — "expires in 12 days" is
 * actionable where "2026-09-08" needs mental arithmetic at the shelf.
 */
export function ExpiryBadge({
  date,
  status,
  showDate = true,
}: {
  date: string
  status: ExpiryStatus
  showDate?: boolean
}) {
  const { t, i18n } = useTranslation()
  const left = daysUntil(date)

  const label =
    status === 'expired'
      ? left === 0
        ? t('stock.expiryStatus.today')
        : t('stock.expiryStatus.expiredDaysAgo', { days: Math.abs(left) })
      : status === 'expiring'
        ? left === 0
          ? t('stock.expiryStatus.today')
          : t('stock.expiryStatus.expiring', { days: left })
        : t('stock.expiryStatus.ok')

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs ${TONE[status]}`}>
      {status !== 'ok' && <span aria-hidden>⚠</span>}
      <span className="font-medium">{label}</span>
      {showDate && (
        <span className="opacity-70">· {new Date(date).toLocaleDateString(i18n.language)}</span>
      )}
    </span>
  )
}
