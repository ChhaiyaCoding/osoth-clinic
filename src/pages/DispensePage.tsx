import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { drugDisplayName, searchDrugs } from '../db/drugs'
import { allergyMatches, patientDisplayName } from '../db/patients'
import {
  InsufficientStockError,
  allocateForDrug,
  quantityFor,
  recordDispense,
  type AllocationResult,
} from '../db/dispensing'
import type { Drug } from '../db/types'
import type { Language } from '../i18n'
import { Modal } from '../components/Modal'
import { PlusIcon, SearchIcon, TrashIcon } from '../components/icons'

interface DraftItem {
  key: string
  drug: Drug
  dose: number
  timesPerDay: number
  days: number
  instruction: string
  allocation?: AllocationResult
}

export function DispensePage() {
  const { patientId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language
  const navigate = useNavigate()

  const [items, setItems] = useState<DraftItem[]>([])
  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ count: number; total: number }>()

  const patient = useLiveQuery(
    async () => (patientId ? ((await db.patients.get(patientId)) ?? null) : null),
    [patientId],
  )

  // Switching patient reuses this component rather than remounting it, so the
  // previous encounter's draft — and its "dispensed" confirmation — have to be
  // cleared explicitly, or the next prescription starts on the last one's screen.
  useEffect(() => {
    setItems([])
    setSymptoms('')
    setDiagnosis('')
    setAcknowledged(false)
    setError(undefined)
    setDone(undefined)
  }, [patientId])

  /**
   * Allocation is previewed live so the prescriber sees a shortfall while there
   * is still time to change the prescription, not at the moment of dispensing.
   */
  const refreshAllocations = useCallback(async (drafts: DraftItem[]) => {
    return Promise.all(
      drafts.map(async (draft) => ({
        ...draft,
        allocation: await allocateForDrug(draft.drug.id, quantityFor(draft)),
      })),
    )
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    void refreshAllocations(items).then((next) => {
      if (cancelled) return
      // Only write back when something actually changed, or this loops forever.
      const changed = next.some(
        (entry, index) =>
          entry.allocation?.shortfall !== items[index].allocation?.shortfall ||
          entry.allocation?.available !== items[index].allocation?.available,
      )
      if (changed) setItems(next)
    })
    return () => {
      cancelled = true
    }
  }, [items, refreshAllocations])

  const allergyHits = patient
    ? items.flatMap((item) =>
        allergyMatches(patient, item.drug).map((allergy) => ({ drug: item.drug, allergy })),
      )
    : []

  const shortfall = items.some((item) => (item.allocation?.shortfall ?? 0) > 0)
  const total = items.reduce(
    (sum, item) => sum + quantityFor(item) * item.drug.sellPrice,
    0,
  )
  const blocked =
    items.length === 0 || shortfall || busy || (allergyHits.length > 0 && !acknowledged)

  function addDrug(drug: Drug) {
    setItems((prev) => [
      ...prev,
      { key: `${drug.id}-${Date.now()}`, drug, dose: 1, timesPerDay: 3, days: 5, instruction: '' },
    ])
    setAcknowledged(false)
  }

  function update(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  async function dispense() {
    setBusy(true)
    setError(undefined)
    try {
      const result = await recordDispense({
        patientId: patient?.id,
        visit: { symptoms, diagnosis },
        items: items.map((item) => ({
          drugId: item.drug.id,
          sellPrice: item.drug.sellPrice,
          item: {
            drugId: item.drug.id,
            dose: item.dose,
            timesPerDay: item.timesPerDay,
            days: item.days,
            qty: quantityFor(item),
            instruction: item.instruction.trim() || undefined,
          },
        })),
      })
      setDone({ count: items.length, total: result.total })
    } catch (cause) {
      setError(
        cause instanceof InsufficientStockError
          ? t('dispense.stockChanged')
          : cause instanceof Error
            ? cause.message
            : String(cause),
      )
      // Re-read stock so the screen reflects whatever changed underneath.
      setItems(await refreshAllocations(items))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <section className="card p-6 text-center">
          <p className="text-2xl font-semibold text-brand-ink">✓ {t('dispense.done')}</p>
          <p className="mt-2 text-ink-2">{t('dispense.doneBody', { count: done.count })}</p>
          {done.total > 0 && (
            <p className="mt-2 text-lg font-semibold">
              {t('dispense.total')}: {done.total.toFixed(2)}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setItems([])
                setSymptoms('')
                setDiagnosis('')
                setAcknowledged(false)
                setDone(undefined)
              }}
              className="btn btn-primary"
            >
              {t('dispense.another')}
            </button>
            {patient && (
              <Link to={`/patients/${patient.id}`} className="btn btn-ghost">
                {patientDisplayName(patient, lang)}
              </Link>
            )}
            <button type="button" onClick={() => navigate('/stock')} className="btn btn-ghost">
              {t('stock.title')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-semibold">{t('dispense.title')}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {patient ? t('dispense.forPatient', { name: patientDisplayName(patient, lang) }) : t('dispense.walkIn')}
        </p>

        {patient && patient.allergies.length > 0 && (
          <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
            ⚠ {t('patient.allergyList', { list: patient.allergies.join(', ') })}
          </p>
        )}

        {patient && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-2">{t('dispense.symptoms')}</span>
              <input className="field" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-2">{t('dispense.diagnosis')}</span>
              <input className="field" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
            </label>
          </div>
        )}
      </section>

      <DrugPicker onPick={addDrug} lang={lang} />

      {allergyHits.length > 0 && patient && (
        <section className="rounded-2xl border border-danger bg-danger-soft p-4">
          <p className="font-semibold text-danger-ink">⚠ {t('dispense.allergyWarning')}</p>
          <p className="mt-1 text-sm leading-relaxed text-danger-ink">
            {t('dispense.allergyBody', {
              name: patientDisplayName(patient, lang),
              list: [...new Set(allergyHits.map((hit) => hit.allergy))].join(', '),
            })}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-danger-ink">
            {allergyHits.map((hit, index) => (
              <li key={index}>• {drugDisplayName(hit.drug, lang)}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2.5 text-sm font-medium text-danger-ink">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="size-4 rounded border-line-strong"
            />
            {t('dispense.allergyAcknowledge')}
          </label>
        </section>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-medium text-ink-2">{t('dispense.empty')}</p>
          <p className="mt-1 text-sm text-ink-3">{t('dispense.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              lang={lang}
              onChange={(patch) => update(item.key, patch)}
              onRemove={() => setItems((prev) => prev.filter((entry) => entry.key !== item.key))}
            />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <section className="card sticky bottom-24 p-4 md:bottom-6">
          {total > 0 && (
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-ink-2">{t('dispense.total')}</span>
              <span className="text-xl font-semibold">{total.toFixed(2)}</span>
            </div>
          )}
          {shortfall && (
            <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {t('dispense.cannotDispense')}
            </p>
          )}
          {error && (
            <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>
          )}
          <button type="button" onClick={dispense} disabled={blocked} className="btn btn-primary w-full">
            {busy ? t('dispense.dispensing') : t('dispense.dispenseAction')}
          </button>
        </section>
      )}
    </div>
  )
}

function ItemRow({
  item,
  lang,
  onChange,
  onRemove,
}: {
  item: DraftItem
  lang: Language
  onChange: (patch: Partial<DraftItem>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const qty = quantityFor(item)
  const allocation = item.allocation
  const short = allocation ? allocation.shortfall : 0

  return (
    <li className="card p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium break-words">{drugDisplayName(item.drug, lang)}</h3>
          <p className="text-xs text-ink-3">
            {item.drug.strength} {item.drug.formLabel || t(`form.${item.drug.form}`)}
          </p>
        </div>
        <button type="button" onClick={onRemove} aria-label={t('dispense.removeItem')} className="icon-btn hover:bg-danger-soft hover:text-danger-ink">
          <TrashIcon />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['dose', item.dose] as const,
            ['timesPerDay', item.timesPerDay] as const,
            ['days', item.days] as const,
          ]
        ).map(([field, value]) => (
          <label key={field} className="block">
            <span className="mb-1 block text-xs text-ink-3">{t(`dispense.${field}`)}</span>
            <input
              className="field text-center"
              type="number"
              inputMode="numeric"
              min={field === 'dose' ? 0.25 : 1}
              step={field === 'dose' ? 0.25 : 1}
              value={value}
              onChange={(event) => onChange({ [field]: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-sm text-ink-2">
        {t('dispense.computed', {
          dose: item.dose,
          times: item.timesPerDay,
          days: item.days,
          qty,
          unit: item.drug.unit || '',
        })}
      </p>

      {allocation && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {short > 0 ? (
            <span className="rounded-lg bg-danger-soft px-2 py-0.5 font-medium text-danger-ink">
              {allocation.available === 0
                ? t('dispense.outOfStock')
                : t('dispense.shortfall', { count: short })}
            </span>
          ) : (
            <span className="rounded-lg bg-brand-soft px-2 py-0.5 font-medium text-brand-ink">
              {t('dispense.available', { count: allocation.available })}
            </span>
          )}
          {allocation.lines.length > 0 && (
            // Showing the lots makes FEFO visible, and gives the person at the
            // shelf the exact boxes to pick.
            <span className="text-ink-3">
              {t('dispense.willTake', {
                lots: allocation.lines.map((line) => `${line.batch.lotNo} (${line.qty})`).join(', '),
              })}
            </span>
          )}
        </div>
      )}

      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-ink-3">{t('dispense.instruction')}</span>
        <input
          className="field"
          value={item.instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </label>
    </li>
  )
}

function DrugPicker({ onPick, lang }: { onPick: (drug: Drug) => void; lang: Language }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useLiveQuery(
    async () => (query.trim() ? (await searchDrugs(query, { lang })).slice(0, 20) : []),
    [query, lang],
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        <PlusIcon />
        {t('dispense.addItem')}
      </button>

      <Modal open={open} title={t('dispense.addItem')} onClose={() => setOpen(false)}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-10"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('dispense.pickDrug')}
            autoFocus
          />
        </div>

        <ul className="mt-3 space-y-1">
          {(results ?? []).map((drug) => (
            <li key={drug.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(drug)
                  setQuery('')
                  setOpen(false)
                }}
                className="panel w-full text-left transition hover:bg-surface-3"
              >
                <span className="block font-medium">{drugDisplayName(drug, lang)}</span>
                <span className="block text-xs text-ink-3">
                  {drug.strength} {drug.formLabel || t(`form.${drug.form}`)} · {drug.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
