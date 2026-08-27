import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { drugStockList, stockAlerts, type DrugStock } from '../db/stock'
import { drugDisplayName } from '../db/drugs'
import type { Language } from '../i18n'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { SearchIcon } from '../components/icons'

export function StockPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language

  const [query, setQuery] = useState('')
  const [onlyWithStock, setOnlyWithStock] = useState(true)

  const alerts = useLiveQuery(() => stockAlerts(), [])
  const rows = useLiveQuery(() => drugStockList(query), [query])

  const visible = rows?.filter((row) => (onlyWithStock ? row.onHand > 0 : true))

  return (
    <div className="space-y-4">
      <AlertPanel />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          className="field pl-10"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('stock.searchPlaceholder')}
          aria-label={t('common.search')}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-ink-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyWithStock}
            onChange={(event) => setOnlyWithStock(event.target.checked)}
            className="size-4 rounded border-line-strong text-brand focus:ring-brand"
          />
          {t('stock.onlyWithStock')}
        </label>
        {visible && <span>{t('drug.count', { count: visible.length })}</span>}
      </div>

      {visible === undefined ? (
        <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="font-medium text-ink-2">
            {query ? t('stock.noResults', { query }) : t('stock.empty')}
          </p>
          {!query && <p className="mt-1 text-sm text-ink-3">{t('stock.emptyHint')}</p>}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((row) => (
            <StockRow key={row.drug.id} row={row} lang={lang} />
          ))}
        </ul>
      )}

      {alerts && (
        <p className="px-1 text-xs text-ink-3">
          {t('stock.warningDays')}: {alerts.warningDays}
        </p>
      )}
    </div>
  )
}

function StockRow({ row, lang }: { row: DrugStock; lang: Language }) {
  const { t } = useTranslation()
  const { drug, onHand, batches, nextExpiry, status, isLow } = row

  return (
    <li className="min-w-0">
      <Link to={`/stock/${drug.id}`} className="card flex min-w-0 items-start gap-3 p-3 transition hover:border-brand-line">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium break-words text-ink">{drugDisplayName(drug, lang)}</h3>
          {drug.strength && <p className="text-sm text-ink-3">{drug.strength}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-2 py-0.5 text-sm font-semibold ${
                onHand === 0
                  ? 'bg-surface-2 text-ink-3'
                  : isLow
                    ? 'bg-warn-soft text-warn-ink'
                    : 'bg-brand-soft text-brand-ink'
              }`}
            >
              {onHand === 0 ? t('stock.noStock') : `${onHand} ${drug.unit || ''}`.trim()}
            </span>
            {batches > 0 && (
              <span className="chip">
                {batches === 1 ? t('stock.batchesOne') : t('stock.batches', { count: batches })}
              </span>
            )}
          </div>

          {nextExpiry && (
            <div className="mt-2">
              <ExpiryBadge date={nextExpiry} status={status} />
            </div>
          )}

          {isLow && drug.reorderLevel > 0 && (
            <p className="mt-1.5 text-xs text-warn-ink">
              {t('stock.reorderAt', { count: drug.reorderLevel })}
            </p>
          )}
        </div>
        <span aria-hidden className="text-ink-3">
          ›
        </span>
      </Link>
    </li>
  )
}

/** The three things worth acting on, collapsed to counts until opened. */
function AlertPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language
  const alerts = useLiveQuery(() => stockAlerts(), [])
  const [open, setOpen] = useState<'expired' | 'expiring' | 'low' | null>(null)

  if (!alerts) return null

  const groups = [
    { key: 'expired' as const, count: alerts.expired.length, label: t('stock.alerts.expired'), tone: 'danger' },
    {
      key: 'expiring' as const,
      count: alerts.expiring.length,
      label: t('stock.alerts.expiring', { days: alerts.warningDays }),
      tone: 'warn',
    },
    { key: 'low' as const, count: alerts.low.length, label: t('stock.alerts.low'), tone: 'warn' },
  ]

  if (groups.every((group) => group.count === 0)) {
    return (
      <section className="card p-4">
        <p className="font-medium text-brand-ink">✓ {t('stock.alerts.allClear')}</p>
        <p className="mt-1 text-sm text-ink-2">{t('stock.alerts.allClearHint')}</p>
      </section>
    )
  }

  const selected = open ? groups.find((group) => group.key === open) : undefined

  return (
    <section className="card p-4">
      <h2 className="font-semibold">{t('stock.alerts.title')}</h2>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            disabled={group.count === 0}
            onClick={() => setOpen(open === group.key ? null : group.key)}
            aria-pressed={open === group.key}
            className={`rounded-xl px-2 py-2.5 text-center transition disabled:opacity-40 ${
              open === group.key ? 'ring-2 ring-brand' : ''
            } ${group.tone === 'danger' ? 'bg-danger-soft text-danger-ink' : 'bg-warn-soft text-warn-ink'}`}
          >
            <span className="block text-2xl font-semibold leading-tight">{group.count}</span>
            <span className="block text-xs leading-snug">{group.label}</span>
          </button>
        ))}
      </div>

      {selected && selected.count > 0 && (
        <ul className="mt-3 space-y-1.5">
          {open === 'low'
            ? alerts.low.slice(0, 20).map((row) => (
                <li key={row.drug.id}>
                  <Link to={`/stock/${row.drug.id}`} className="panel flex items-center gap-2 text-sm hover:bg-surface-3">
                    <span className="min-w-0 flex-1 truncate">{drugDisplayName(row.drug, lang)}</span>
                    <span className="shrink-0 font-medium text-warn-ink">
                      {row.onHand} / {row.drug.reorderLevel}
                    </span>
                  </Link>
                </li>
              ))
            : (open === 'expired' ? alerts.expired : alerts.expiring).slice(0, 20).map(({ batch, drug, status }) => (
                <li key={batch.id}>
                  <Link to={`/stock/${drug.id}`} className="panel block text-sm hover:bg-surface-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{drugDisplayName(drug, lang)}</span>
                      <span className="chip shrink-0 font-mono">{batch.lotNo}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ExpiryBadge date={batch.expiryDate} status={status} />
                      <span className="text-xs text-ink-3">
                        {batch.qtyOnHand} {drug.unit}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
        </ul>
      )}
    </section>
  )
}
