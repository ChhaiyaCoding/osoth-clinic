import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { drugDisplayName } from '../db/drugs'
import { adjustBatch, batchesForDrug, expiryStatus, movesForDrug, writeOffBatch } from '../db/stock'
import type { Batch, StockMove } from '../db/types'
import type { Language } from '../i18n'
import { Modal } from '../components/Modal'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { PlusIcon } from '../components/icons'
import { ReceiveStockModal } from './ReceiveStockModal'

export function DrugStockPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language

  const [receiveOpen, setReceiveOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<Batch>()
  const [writingOff, setWritingOff] = useState<Batch>()

  const drug = useLiveQuery(async () => (await db.drugs.get(id)) ?? null, [id])
  const data = useLiveQuery(async () => {
    const settings = await getSettings()
    return { batches: await batchesForDrug(id), moves: await movesForDrug(id), settings }
  }, [id])

  if (drug === undefined || data === undefined)
    return <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
  if (drug === null || drug.deletedAt) return <Navigate to="/stock" replace />

  const { batches, moves, settings } = data
  const live = batches.filter((batch) => batch.qtyOnHand > 0)
  const onHand = live.reduce((sum, batch) => sum + batch.qtyOnHand, 0)

  return (
    <div className="space-y-4">
      <nav className="text-sm">
        <Link to="/stock" className="font-medium text-brand-ink hover:underline">
          ‹ {t('stock.title')}
        </Link>
      </nav>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold break-words">{drugDisplayName(drug, lang)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className="chip font-mono">{drug.code}</span>
              {drug.strength && <span>{drug.strength}</span>}
              <span>{drug.formLabel || t(`form.${drug.form}`)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-3">{t('stock.onHand')}</p>
            <p className="text-2xl font-semibold text-ink">
              {onHand} <span className="text-base font-normal text-ink-3">{drug.unit}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setReceiveOpen(true)} className="btn btn-primary">
            <PlusIcon />
            {t('stock.receive')}
          </button>
          <Link to={`/drugs/${drug.id}`} className="btn btn-ghost">
            {t('monograph.title')}
          </Link>
        </div>
      </section>

      <section>
        <h3 className="mb-2 px-1 font-semibold">{t('stock.viewBatches')}</h3>
        {batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="font-medium text-ink-2">{t('stock.empty')}</p>
            <p className="mt-1 text-sm text-ink-3">{t('stock.emptyHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {batches.map((batch) => (
              <li key={batch.id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip font-mono">{batch.lotNo}</span>
                  <ExpiryBadge
                    date={batch.expiryDate}
                    status={expiryStatus(batch.expiryDate, settings.expiryWarningDays)}
                  />
                  <span
                    className={`ml-auto text-lg font-semibold ${
                      batch.qtyOnHand === 0 ? 'text-ink-3' : 'text-ink'
                    }`}
                  >
                    {batch.qtyOnHand} <span className="text-sm font-normal text-ink-3">{drug.unit}</span>
                  </span>
                </div>

                {batch.supplier && <p className="mt-1.5 text-xs text-ink-3">{batch.supplier}</p>}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAdjusting(batch)} className="btn btn-soft px-3 py-1.5 text-sm">
                    {t('stock.adjust')}
                  </button>
                  {batch.qtyOnHand > 0 && (
                    <button
                      type="button"
                      onClick={() => setWritingOff(batch)}
                      className="btn px-3 py-1.5 text-sm bg-danger-soft text-danger-ink hover:brightness-95"
                    >
                      {t('stock.writeOff')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Ledger moves={moves} unit={drug.unit} />

      <ReceiveStockModal open={receiveOpen} drug={drug} onClose={() => setReceiveOpen(false)} />
      {adjusting && (
        <AdjustModal batch={adjusting} unit={drug.unit} onClose={() => setAdjusting(undefined)} />
      )}
      {writingOff && (
        <WriteOffModal batch={writingOff} unit={drug.unit} onClose={() => setWritingOff(undefined)} />
      )}
    </div>
  )
}

/** The append-only history. Read newest first, which is how it gets checked. */
function Ledger({ moves, unit }: { moves: StockMove[]; unit: string }) {
  const { t, i18n } = useTranslation()

  return (
    <section>
      <h3 className="mb-2 px-1 font-semibold">{t('stock.ledger')}</h3>
      {moves.length === 0 ? (
        <p className="panel text-sm text-ink-3">{t('stock.ledgerEmpty')}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {moves.map((move) => (
            <li key={move.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span
                className={`font-semibold tabular-nums ${
                  move.qty > 0 ? 'text-brand-ink' : 'text-danger-ink'
                }`}
              >
                {move.qty > 0 ? '+' : ''}
                {move.qty} <span className="font-normal text-ink-3">{unit}</span>
              </span>
              <span className="text-ink-2">{t(`stock.moveType.${move.type}`)}</span>
              <span className="ml-auto text-xs text-ink-3">
                {new Date(move.occurredAt).toLocaleDateString(i18n.language)}
              </span>
              {move.reason && <span className="w-full text-xs text-ink-3">{move.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AdjustModal({ batch, unit, onClose }: { batch: Batch; unit: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [counted, setCounted] = useState(batch.qtyOnHand)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const delta = counted - batch.qtyOnHand

  async function save() {
    if (delta !== 0 && !reason.trim()) {
      setError(t('stock.validation.reasonRequired'))
      return
    }
    setSaving(true)
    try {
      await adjustBatch(batch.id, counted, reason)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="compact"
      title={t('stock.adjustTitle', { lot: batch.lotNo })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-2">{t('stock.fields.counted')}</span>
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={0}
            value={counted}
            onChange={(event) => setCounted(Math.max(0, Number(event.target.value) || 0))}
            autoFocus
          />
          <span className="mt-1 block text-xs text-ink-3">{t('stock.hints.counted')}</span>
        </label>

        {/* Showing the difference makes the ledger entry predictable before saving. */}
        {delta !== 0 && (
          <p className={`panel text-sm font-medium ${delta > 0 ? 'text-brand-ink' : 'text-danger-ink'}`}>
            {delta > 0 ? '+' : ''}
            {delta} {unit}
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-2">{t('stock.fields.reason')}</span>
          <input
            className="field"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setError(undefined)
            }}
          />
          {error ? (
            <span className="mt-1 block text-xs text-danger-ink">{error}</span>
          ) : (
            <span className="mt-1 block text-xs text-ink-3">{t('stock.hints.reasonAdjust')}</span>
          )}
        </label>
      </div>
    </Modal>
  )
}

function WriteOffModal({ batch, unit, onClose }: { batch: Batch; unit: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      open
      size="compact"
      title={t('stock.writeOffTitle', { lot: batch.lotNo })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await writeOffBatch(batch.id, t('stock.moveType.expired'))
                onClose()
              } finally {
                setSaving(false)
              }
            }}
            className="btn btn-danger"
          >
            {t('stock.writeOff')}
          </button>
        </>
      }
    >
      <p className="leading-relaxed text-ink-2">
        {t('stock.writeOffBody', { qty: `${batch.qtyOnHand} ${unit}`.trim() })}
      </p>
    </Modal>
  )
}
