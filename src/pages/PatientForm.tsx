import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import {
  createPatient,
  emptyPatientInput,
  nextPatientCode,
  updatePatient,
  type PatientInput,
} from '../db/patients'
import type { Patient } from '../db/types'

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

export function PatientFormModal({
  open,
  patient,
  onClose,
  onSaved,
}: {
  open: boolean
  patient?: Patient
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<PatientInput>(emptyPatientInput)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(undefined)
    if (patient) {
      // Copy only the editable fields; the id/timestamp envelope stays put.
      setValues({
        code: patient.code,
        nameKh: patient.nameKh,
        nameEn: patient.nameEn,
        sex: patient.sex,
        dob: patient.dob ?? '',
        phone: patient.phone ?? '',
        address: patient.address ?? '',
        allergies: patient.allergies ?? [],
        note: patient.note ?? '',
      })
    } else {
      // Offer the next code up front, so most records need no thought here.
      setValues(emptyPatientInput())
      void nextPatientCode().then((code) => setValues((prev) => ({ ...prev, code })))
    }
  }, [open, patient])

  function set<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!values.nameKh.trim() && !values.nameEn.trim()) {
      setError(t('patient.validation.nameRequired'))
      return
    }
    setSaving(true)
    try {
      // The save must happen before the callback, never inside its arguments:
      // `onSaved?.(await createPatient(...))` short-circuits when `onSaved` is
      // undefined and silently skips the save entirely.
      let savedId = patient?.id
      if (patient) await updatePatient(patient.id, values)
      else savedId = await createPatient(values)
      onSaved?.(savedId!)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={patient ? t('patient.editTitle') : t('patient.addTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button type="submit" form="patient-form" disabled={saving} className="btn btn-primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="patient-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('patient.fields.code')} hint={t('patient.hints.code')}>
          <input className="field font-mono" value={values.code} onChange={(e) => set('code', e.target.value)} />
        </Field>

        <Field label={t('patient.fields.phone')}>
          <input className="field" type="tel" inputMode="tel" value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>

        <Field label={t('patient.fields.nameKh')} error={error}>
          <input className="field" lang="km" value={values.nameKh} onChange={(e) => set('nameKh', e.target.value)} autoFocus />
        </Field>

        <Field label={t('patient.fields.nameEn')}>
          <input className="field" lang="en" value={values.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>

        <Field label={t('patient.fields.sex')}>
          <select className="field" value={values.sex} onChange={(e) => set('sex', e.target.value as PatientInput['sex'])}>
            {(['female', 'male', 'other'] as const).map((option) => (
              <option key={option} value={option}>
                {t(`patient.sexOptions.${option}`)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('patient.fields.dob')}>
          <input className="field" type="date" value={values.dob ?? ''} onChange={(e) => set('dob', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          {/* Allergies drive the dispensing warning, so they get the full width. */}
          <Field label={t('patient.fields.allergies')} hint={t('patient.hints.allergies')}>
            <input
              className="field"
              value={values.allergies.join(', ')}
              onChange={(e) =>
                set(
                  'allergies',
                  e.target.value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label={t('patient.fields.address')}>
            <input className="field" value={values.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label={t('patient.fields.note')}>
            <textarea className="field min-h-20" value={values.note ?? ''} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
