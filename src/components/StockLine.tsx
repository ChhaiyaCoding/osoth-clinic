import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db/db'
import { batchesForDrug, expiryStatus } from '../db/stock'
import type { Drug } from '../db/types'
import { ExpiryBadge } from './ExpiryBadge'

/**
 * Current stock on the drug page. Someone reading a monograph to decide what to
 * give needs to know whether it is actually on the shelf.
 */
export function StockLine({ drug }: { drug: Drug }) {
  const { t } = useTranslation()

  const stock = useLiveQuery(async () => {
    const [batches, settings] = await Promise.all([batchesForDrug(drug.id), getSettings()])
    const live = batches.filter((batch) => batch.qtyOnHand > 0)
    const nextExpiry = live.map((batch) => batch.expiryDate).sort().at(0)
    return {
      onHand: live.reduce((sum, batch) => sum + batch.qtyOnHand, 0),
      nextExpiry,
      status: nextExpiry ? expiryStatus(nextExpiry, settings.expiryWarningDays) : undefined,
    }
  }, [drug.id])

  if (!stock) return null

  const isLow = drug.reorderLevel > 0 && stock.onHand <= drug.reorderLevel

  return (
    <Link to={`/stock/${drug.id}`} className="card flex flex-wrap items-center gap-3 p-3 transition hover:border-brand-line">
      <span className="text-sm text-ink-3">{t('stock.onHand')}</span>
      <span
        className={`rounded-lg px-2 py-0.5 font-semibold ${
          stock.onHand === 0
            ? 'bg-surface-2 text-ink-3'
            : isLow
              ? 'bg-warn-soft text-warn-ink'
              : 'bg-brand-soft text-brand-ink'
        }`}
      >
        {stock.onHand === 0 ? t('stock.noStock') : `${stock.onHand} ${drug.unit || ''}`.trim()}
      </span>
      {stock.nextExpiry && stock.status && (
        <ExpiryBadge date={stock.nextExpiry} status={stock.status} />
      )}
      <span aria-hidden className="ml-auto text-ink-3">›</span>
    </Link>
  )
}
