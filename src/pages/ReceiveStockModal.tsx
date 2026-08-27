import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { defaultExpiryDate, receiveStock } from '../db/stock'
import { isValidIsoDate, toIsoDate } from '../lib/dates'
import { drugDisplayName } from '../db/drugs'
import type { Drug } from '../db/types'
import type { Language } from '../i18n'

interface Props {
  open: boolean
  drug: Drug
  onClose: () => void
}

type Errors = Partial<Record<'lotNo' | 'expiryDate' | 'quantity', string>>

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger-ink">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}

export function ReceiveStockModal({ open, drug, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language

  const [lotNo, setLotNo] = useState('')
  const [expiryDate, setExpiryDate] = useState(defaultExpiryDate)
  // Deliveries arrive in packs but stock is counted in dispensing units, so the
  // form takes whichever the person is holding and converts.
  const [byPack, setByPack] = useState(false)
  const [amount, setAmount] = useState(1)
  const [costPrice, setCostPrice] = useState(0)
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLotNo('')
    setExpiryDate(defaultExpiryDate())
    setByPack(drug.packSize > 1)
    setAmount(1)
    setCostPrice(drug.costPrice)
    setSupplier('')
    setNote('')
    setErrors({})
  }, [open, drug])

  const packSize = Math.max(1, drug.packSize)
  const units = byPack ? amount * packSize : amount

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!lotNo.trim()) next.lotNo = t('stock.validation.lotRequired')
    if (!isValidIsoDate(expiryDate)) next.expiryDate = t('stock.validation.expiryRequired')
    else if (expiryDate < toIsoDate()) next.expiryDate = t('stock.validation.expiryPast')
    if (units <= 0) next.quantity = t('stock.validation.quantityMin')

    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }

    setSaving(true)
    try {
      await receiveStock({
        drugId: drug.id,
        lotNo,
        expiryDate,
        quantity: units,
        costPrice,
        supplier,
        note,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('stock.receiveFor', { name: drugDisplayName(drug, lang) })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" form="receive-form" disabled={saving} className="btn btn-primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('stock.fields.lotNo')} hint={t('stock.hints.lotNo')} error={errors.lotNo}>
          <input className="field font-mono" value={lotNo} onChange={(e) => setLotNo(e.target.value)} autoFocus />
        </Field>

        <Field label={t('stock.fields.expiryDate')} error={errors.expiryDate}>
          <input
            className="field"
            type="date"
            value={expiryDate}
            min={toIsoDate()}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          {packSize > 1 && (
            <div className="mb-2 flex gap-2">
              {([true, false] as const).map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  onClick={() => setByPack(option)}
                  aria-pressed={byPack === option}
                  className={`btn flex-1 ${byPack === option ? 'btn-primary' : 'btn-soft'}`}
                >
                  {t(option ? 'stock.fields.packs' : 'stock.fields.units')}
                </button>
              ))}
            </div>
          )}

          <Field
            label={t('stock.fields.quantity')}
            error={errors.quantity}
            hint={
              byPack && packSize > 1
                ? t('stock.hints.packsToUnits', {
                    packs: amount,
                    size: packSize,
                    total: units,
                    unit: drug.unit || t('stock.fields.units'),
                  })
                : undefined
            }
          >
            <input
              className="field"
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
        </div>

        <Field label={t('stock.fields.costPrice')}>
          <input
            className="field"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>

        <Field label={t('stock.fields.supplier')}>
          <input className="field" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Field label={t('stock.fields.note')}>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
