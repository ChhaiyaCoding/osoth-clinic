import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { createDrug, emptyDrugInput, isCodeTaken, updateDrug, type DrugInput } from '../db/drugs'
import { DRUG_FORMS, type Drug, type DrugForm as DosageForm } from '../db/types'

interface DrugFormProps {
  open: boolean
  /** The drug being edited, or undefined when adding a new one. */
  drug?: Drug
  onClose: () => void
}

type Errors = Partial<Record<keyof DrugInput, string>>

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

export function DrugFormModal({ open, drug, onClose }: DrugFormProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState<DrugInput>(emptyDrugInput)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  // Reload the form whenever it is opened, so a cancelled edit leaves no residue.
  useEffect(() => {
    if (!open) return
    setErrors({})
    setValues(drug ? { ...emptyDrugInput(), ...stripEnvelope(drug) } : emptyDrugInput())
  }, [open, drug])

  function set<K extends keyof DrugInput>(key: K, value: DrugInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  async function validate(): Promise<Errors> {
    const next: Errors = {}
    if (!values.code.trim()) next.code = t('drug.validation.codeRequired')
    else if (await isCodeTaken(values.code, drug?.id)) next.code = t('drug.validation.codeTaken')
    if (!values.nameKh.trim() && !values.nameEn.trim())
      next.nameKh = t('drug.validation.nameRequired')
    if (values.packSize < 1) next.packSize = t('drug.validation.packSizeMin')
    for (const key of ['reorderLevel', 'costPrice', 'sellPrice'] as const) {
      if (values[key] < 0) next[key] = t('drug.validation.negative')
    }
    return next
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const found = await validate()
      if (Object.keys(found).length > 0) {
        setErrors(found)
        return
      }
      if (drug) await updateDrug(drug.id, values)
      else await createDrug(values)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={drug ? t('drug.editTitle') : t('drug.addTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" form="drug-form" disabled={saving} className="btn btn-primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="drug-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('drug.fields.code')} hint={t('drug.hints.code')} error={errors.code}>
          <input
            className="field font-mono"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            autoFocus
          />
        </Field>

        <Field label={t('drug.fields.generic')}>
          <input
            className="field"
            value={values.generic}
            onChange={(e) => set('generic', e.target.value)}
          />
        </Field>

        <Field label={t('drug.fields.brandNames')} hint={t('drug.hints.brandNames')}>
          <input
            className="field"
            value={values.brandNames.join(', ')}
            onChange={(e) => set('brandNames', splitList(e.target.value))}
          />
        </Field>

        <Field label={t('drug.fields.classes')} hint={t('drug.hints.classes')}>
          <input
            className="field"
            value={values.classes.join(', ')}
            onChange={(e) => set('classes', splitList(e.target.value))}
          />
        </Field>

        <Field label={t('drug.fields.rxStatus')}>
          <select
            className="field"
            value={values.rxStatus}
            onChange={(e) => set('rxStatus', e.target.value as DrugInput['rxStatus'])}
          >
            <option value="rx">{t('drug.rx')}</option>
            <option value="otc">{t('drug.otc')}</option>
          </select>
        </Field>

        <Field label={t('drug.fields.nameKh')} error={errors.nameKh}>
          <input
            className="field"
            lang="km"
            value={values.nameKh}
            onChange={(e) => set('nameKh', e.target.value)}
          />
        </Field>

        <Field label={t('drug.fields.nameEn')}>
          <input
            className="field"
            lang="en"
            value={values.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
          />
        </Field>

        <Field label={t('drug.fields.nameJa')}>
          <input
            className="field"
            lang="ja"
            value={values.nameJa}
            onChange={(e) => set('nameJa', e.target.value)}
          />
        </Field>

        <Field label={t('drug.fields.form')}>
          <select
            className="field"
            value={values.form}
            onChange={(e) => set('form', e.target.value as DosageForm)}
          >
            {DRUG_FORMS.map((form) => (
              <option key={form} value={form}>
                {t(`form.${form}`)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('drug.fields.strength')} hint={t('drug.hints.strength')}>
          <input
            className="field"
            value={values.strength}
            onChange={(e) => set('strength', e.target.value)}
          />
        </Field>

        <Field label={t('drug.fields.unit')} hint={t('drug.hints.unit')}>
          <input className="field" value={values.unit} onChange={(e) => set('unit', e.target.value)} />
        </Field>

        <Field label={t('drug.fields.packSize')} hint={t('drug.hints.packSize')} error={errors.packSize}>
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            value={values.packSize}
            onChange={(e) => set('packSize', toNumber(e.target.value))}
          />
        </Field>

        <Field
          label={t('drug.fields.reorderLevel')}
          hint={t('drug.hints.reorderLevel')}
          error={errors.reorderLevel}
        >
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={0}
            value={values.reorderLevel}
            onChange={(e) => set('reorderLevel', toNumber(e.target.value))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 sm:col-span-2">
          <Field label={t('drug.fields.costPrice')} error={errors.costPrice}>
            <input
              className="field"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.costPrice}
              onChange={(e) => set('costPrice', toNumber(e.target.value))}
            />
          </Field>
          <Field label={t('drug.fields.sellPrice')} error={errors.sellPrice}>
            <input
              className="field"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.sellPrice}
              onChange={(e) => set('sellPrice', toNumber(e.target.value))}
            />
          </Field>
        </div>

        <Field label={t('drug.fields.note')}>
          <textarea
            className="field min-h-20"
            value={values.note ?? ''}
            onChange={(e) => set('note', e.target.value)}
          />
        </Field>

        <div className="flex flex-col justify-end gap-3 pb-1">
          <Checkbox
            label={t('drug.fields.isControlled')}
            checked={values.isControlled}
            onChange={(v) => set('isControlled', v)}
          />
          <Checkbox
            label={t('drug.fields.isArchived')}
            checked={values.isArchived}
            onChange={(v) => set('isArchived', v)}
          />
        </div>
      </form>
    </Modal>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line-strong text-brand-ink focus:ring-brand"
      />
      {label}
    </label>
  )
}

/**
 * Comma-separated text to a clean list. Blank entries are dropped, so a
 * trailing comma while typing does not create an empty brand name.
 */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Empty number inputs come through as '', which must not become NaN. */
function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Copy only the editable fields. Listed explicitly rather than spread, because
 * the stored row also carries the derived `searchText` index that must not
 * round-trip through the form.
 */
function stripEnvelope(drug: Drug): DrugInput {
  return {
    code: drug.code,
    nameKh: drug.nameKh,
    nameEn: drug.nameEn,
    nameJa: drug.nameJa ?? '',
    generic: drug.generic,
    brandNames: drug.brandNames,
    classes: drug.classes,
    rxStatus: drug.rxStatus,
    // Carried through untouched — the monograph is edited on its own pages.
    monograph: drug.monograph,
    form: drug.form,
    formLabel: drug.formLabel,
    strength: drug.strength,
    unit: drug.unit,
    packSize: drug.packSize,
    reorderLevel: drug.reorderLevel,
    costPrice: drug.costPrice,
    sellPrice: drug.sellPrice,
    note: drug.note ?? '',
    isControlled: drug.isControlled,
    isArchived: drug.isArchived,
  }
}
