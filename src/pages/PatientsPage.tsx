import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { ageOf, patientDisplayName, searchPatients } from '../db/patients'
import type { Patient } from '../db/types'
import type { Language } from '../i18n'
import { PatientFormModal } from './PatientForm'
import { PlusIcon, SearchIcon } from '../components/icons'

export function PatientsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language

  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const patients = useLiveQuery(() => searchPatients(query, lang), [query, lang])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-10"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('patient.searchPlaceholder')}
            aria-label={t('common.search')}
          />
        </div>
        <button onClick={() => setFormOpen(true)} className="btn btn-primary">
          <PlusIcon />
          {t('common.add')}
        </button>
      </div>

      {patients && (
        <p className="px-1 text-right text-sm text-ink-2">
          {t('patient.count', { count: patients.length })}
        </p>
      )}

      {patients === undefined ? (
        <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="font-medium text-ink-2">
            {query ? t('patient.noResults', { query }) : t('patient.empty')}
          </p>
          {!query && <p className="mt-1 text-sm text-ink-3">{t('patient.emptyHint')}</p>}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} lang={lang} />
          ))}
        </ul>
      )}

      <PatientFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}

function PatientCard({ patient, lang }: { patient: Patient; lang: Language }) {
  const { t } = useTranslation()
  const age = ageOf(patient)

  return (
    <li className="min-w-0">
      <Link to={`/patients/${patient.id}`} className="card flex min-w-0 items-start gap-3 p-3 transition hover:border-brand-line">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-medium break-words text-ink">{patientDisplayName(patient, lang)}</h3>
            <span className="chip font-mono">{patient.code}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <span>{t(`patient.sexOptions.${patient.sex}`)}</span>
            {age && (
              <span>
                {age.years >= 1
                  ? t('patient.ageYears', { count: age.years })
                  : t('patient.ageMonths', { count: age.months })}
              </span>
            )}
            {patient.phone && <span>{patient.phone}</span>}
          </div>

          {/* Allergies are the one thing that must be visible without opening. */}
          {patient.allergies.length > 0 && (
            <p className="mt-2 rounded-lg bg-danger-soft px-2 py-1 text-xs font-medium text-danger-ink">
              ⚠ {t('patient.allergyList', { list: patient.allergies.join(', ') })}
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
