import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  buildReport,
  presetPeriod,
  reportRows,
  type DayPoint,
  type PeriodPreset,
  type ReportBundle,
} from '../db/reports'
import { db } from '../db/db'
import { drugDisplayName } from '../db/drugs'
import { toCsv } from '../lib/csv'
import type { Language } from '../i18n'
import { BoxIcon, ChartIcon, PillIcon } from '../components/icons'

const PRESETS: PeriodPreset[] = ['today', 'week', 'month', 'year']

export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language
  const [preset, setPreset] = useState<PeriodPreset>('month')

  const report = useLiveQuery(() => buildReport(presetPeriod(preset)), [preset])

  // Revenue reads as zero until sell prices are entered, which is confusing
  // enough to call out rather than leave the reader guessing.
  const pricesMissing = useLiveQuery(async () => {
    const drugs = await db.drugs.toArray()
    const live = drugs.filter((drug) => !drug.deletedAt && !drug.isArchived)
    if (live.length === 0) return false
    return live.filter((drug) => drug.sellPrice > 0).length / live.length < 0.2
  }, [])

  function exportCsv() {
    if (!report) return
    const csv = toCsv(reportRows(report, lang === 'km' ? 'km' : 'en'))
    const link = document.createElement('a')
    // BOM so Excel opens the Khmer text correctly.
    link.href = `data:text/csv;charset=utf-8,﻿${encodeURIComponent(csv)}`
    link.download = `report-${report.period.from}_${report.period.to}.csv`
    link.click()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPreset(option)}
            aria-pressed={preset === option}
            className={`btn px-2 py-2 text-sm ${preset === option ? 'btn-primary' : 'btn-soft'}`}
          >
            {t(`report.period.${option}`)}
          </button>
        ))}
      </div>

      {report === undefined ? (
        <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
      ) : (
        <>
          {pricesMissing && report.sales.revenue === 0 && report.sales.units > 0 && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
              {t('report.pricesMissing')}
            </p>
          )}

          <SalesCard report={report} />
          <DailyChart points={report.daily} />
          <TopMedicines report={report} lang={lang} />
          <MovementsCard report={report} />
          <ValuationCard report={report} />

          <button type="button" onClick={exportCsv} className="btn btn-ghost w-full">
            {t('report.export')}
          </button>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'warn' }) {
  return (
    <div className="panel">
      <p className="text-xs text-ink-3">{label}</p>
      <p
        className={`text-xl font-semibold tabular-nums ${
          tone === 'brand' ? 'text-brand-ink' : tone === 'warn' ? 'text-warn-ink' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SalesCard({ report }: { report: ReportBundle }) {
  const { t, i18n } = useTranslation()
  const { sales, period } = report
  const money = (value: number) => value.toFixed(2)

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <ChartIcon />
        {t('report.sales')}
      </h2>
      <p className="mt-1 text-xs text-ink-3">
        {t('report.range', {
          from: new Date(`${period.from}T12:00:00`).toLocaleDateString(i18n.language),
          to: new Date(`${period.to}T12:00:00`).toLocaleDateString(i18n.language),
        })}
      </p>

      {sales.units === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
          <p className="font-medium text-ink-2">{t('report.noSales')}</p>
          <p className="mt-1 text-sm text-ink-3">{t('report.noSalesHint')}</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('report.dispenses')} value={String(sales.dispenses)} />
          <Stat label={t('report.units')} value={String(sales.units)} />
          <Stat label={t('report.revenue')} value={money(sales.revenue)} />
          <Stat
            label={
              sales.margin === undefined
                ? t('report.profit')
                : `${t('report.profit')} · ${Math.round(sales.margin * 100)}%`
            }
            value={money(sales.profit)}
            tone={sales.profit >= 0 ? 'brand' : 'warn'}
          />
        </div>
      )}
    </section>
  )
}

/**
 * A bare SVG bar chart — no charting library, so nothing extra to precache for
 * offline use. Bars use currentColor so they follow the theme automatically.
 */
function DailyChart({ points }: { points: DayPoint[] }) {
  const { t, i18n } = useTranslation()
  if (points.length < 2) return null

  const values = points.map((point) => point.revenue || point.units)
  const peak = Math.max(...values, 1)
  const showRevenue = points.some((point) => point.revenue > 0)
  const width = 100
  const height = 32
  const gap = points.length > 40 ? 0.2 : 0.6
  const barWidth = width / points.length - gap

  return (
    <section className="card p-4">
      <h2 className="font-semibold">{t('report.daily')}</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('report.daily')}
        className="mt-3 h-24 w-full text-brand"
      >
        {points.map((point, index) => {
          const value = showRevenue ? point.revenue : point.units
          const barHeight = value > 0 ? Math.max(0.6, (value / peak) * height) : 0
          return (
            <rect
              key={point.date}
              x={index * (width / points.length)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={0.4}
              fill="currentColor"
              opacity={value > 0 ? 0.9 : 0.15}
            />
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-ink-3">
        <span>{new Date(`${points[0].date}T12:00:00`).toLocaleDateString(i18n.language)}</span>
        <span>
          {new Date(`${points.at(-1)!.date}T12:00:00`).toLocaleDateString(i18n.language)}
        </span>
      </div>
    </section>
  )
}

function TopMedicines({ report, lang }: { report: ReportBundle; lang: Language }) {
  const { t } = useTranslation()
  const rows = report.top.slice(0, 10)
  const peak = rows[0]?.units ?? 1

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <PillIcon />
        {t('report.top')}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t('report.topEmpty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.drug.id}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {drugDisplayName(row.drug, lang)}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {row.units} <span className="font-normal text-ink-3">{row.drug.unit}</span>
                </span>
              </div>
              {/* A bar makes the ranking readable at a glance; the number alone
                  makes the reader compare digits. */}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.max(3, (row.units / peak) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function signed(value: number, sign: '+' | '−'): string {
  return value === 0 ? '0' : `${sign}${value}`
}

function MovementsCard({ report }: { report: ReportBundle }) {
  const { t } = useTranslation()
  const { movements } = report

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BoxIcon />
        {t('report.movements')}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {/* Signs only where there is a movement — "−0" reads as a mistake. */}
        <Stat label={t('report.received')} value={signed(movements.received, '+')} tone="brand" />
        <Stat label={t('report.dispensed')} value={signed(movements.dispensed, '−')} />
        <Stat
          label={t('report.writtenOff')}
          value={signed(movements.writtenOff, '−')}
          tone={movements.writtenOff > 0 ? 'warn' : undefined}
        />
      </div>
    </section>
  )
}

function ValuationCard({ report }: { report: ReportBundle }) {
  const { t } = useTranslation()
  const { valuation } = report
  const money = (value: number) => value.toFixed(2)
  const atRisk = valuation.expiredValue + valuation.expiringValue

  return (
    <section className="card p-4">
      <h2 className="font-semibold">{t('report.valuation')}</h2>
      <p className="mt-1 text-xs text-ink-3">
        {t('report.valuationUnits', { units: valuation.units, batches: valuation.batches })}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={t('report.valuationCost')} value={money(valuation.costValue)} />
        <Stat label={t('report.valuationRetail')} value={money(valuation.retailValue)} tone="brand" />
      </div>

      {atRisk > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-warn-ink">{t('report.atRisk')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t('report.expiredValue')} value={money(valuation.expiredValue)} tone="warn" />
            <Stat label={t('report.expiringValue')} value={money(valuation.expiringValue)} tone="warn" />
          </div>
        </div>
      )}
    </section>
  )
}
