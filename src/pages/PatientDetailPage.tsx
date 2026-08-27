import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { ageOf, deletePatient, patientDisplayName } from '../db/patients'
import { historyForPatient } from '../db/dispensing'
import type { Language } from '../i18n'
import { Modal } from '../components/Modal'
import { PatientFormModal } from './PatientForm'
import { EditIcon, PlusIcon, TrashIcon } from '../components/icons'

export function PatientDetailPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language
  const navigate = useNavigate()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patient = useLiveQuery(async () => (await db.patients.get(id)) ?? null, [id])
  const history = useLiveQuery(() => historyForPatient(id), [id])
  const drugs = useLiveQuery(() => db.drugs.toArray(), [])

  if (patient === undefined) return <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
  if (patient === null || patient.deletedAt) return <Navigate to="/patients" replace />

  const age = ageOf(patient)
  const drugName = (drugId: string) => {
    const drug = drugs?.find((candidate) => candidate.id === drugId)
    if (!drug) return drugId
    return lang === 'km' ? drug.nameKh || drug.nameEn : drug.nameEn || drug.nameKh
  }

  return (
    <div className="space-y-4">
      <nav className="text-sm">
        <Link to="/patients" className="font-medium text-brand-ink hover:underline">
          ‹ {t('patient.title')}
        </Link>
      </nav>

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-xl font-semibold break-words">{patientDisplayName(patient, lang)}</h2>
              <span className="chip font-mono">{patient.code}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
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
            {patient.address && <p className="mt-1 text-sm text-ink-3">{patient.address}</p>}
          </div>

          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setEditOpen(true)} aria-label={t('common.edit')} className="icon-btn hover:text-brand-ink">
              <EditIcon />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={t('common.delete')}
              className="icon-btn hover:bg-danger-soft hover:text-danger-ink"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        <div
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            patient.allergies.length > 0
              ? 'bg-danger-soft font-medium text-danger-ink'
              : 'bg-surface-2 text-ink-3'
          }`}
        >
          {patient.allergies.length > 0
            ? `⚠ ${t('patient.allergyList', { list: patient.allergies.join(', ') })}`
            : t('patient.noAllergies')}
        </div>

        {patient.note && <p className="mt-3 whitespace-pre-line text-sm text-ink-2">{patient.note}</p>}

        <Link to={`/dispense/${patient.id}`} className="btn btn-primary mt-3 w-full sm:w-auto">
          <PlusIcon />
          {t('patient.newVisit')}
        </Link>
      </section>

      <section>
        <h3 className="mb-2 px-1 font-semibold">{t('patient.history')}</h3>
        {history === undefined ? (
          <p className="panel text-sm text-ink-3">{t('common.loading')}</p>
        ) : history.length === 0 ? (
          <p className="panel text-sm text-ink-3">{t('patient.historyEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {history.map(({ visit, prescription, dispense }) => (
              <li key={visit.id} className="card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {new Date(visit.visitedAt).toLocaleDateString(i18n.language)}
                  </span>
                  {dispense && dispense.total > 0 && (
                    <span className="text-sm font-semibold text-brand-ink">
                      {dispense.total.toFixed(2)}
                    </span>
                  )}
                </div>

                {visit.diagnosis && <p className="mt-1 text-sm text-ink-2">{visit.diagnosis}</p>}
                {visit.symptoms && <p className="text-sm text-ink-3">{visit.symptoms}</p>}

                {prescription && prescription.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {prescription.items.map((item, index) => (
                      <li key={index} className="panel text-sm">
                        <span className="font-medium">{drugName(item.drugId)}</span>
                        <span className="ml-2 text-ink-3">
                          {item.dose} × {item.timesPerDay}/{t('dispense.days').toLowerCase()} ×{' '}
                          {item.days} = {item.qty}
                        </span>
                        {item.instruction && (
                          <span className="block text-xs text-ink-3">{item.instruction}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <PatientFormModal open={editOpen} patient={patient} onClose={() => setEditOpen(false)} />

      <Modal
        open={confirmDelete}
        size="compact"
        title={t('patient.confirmDelete', { name: patientDisplayName(patient, lang) })}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-ghost">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await deletePatient(patient.id)
                navigate('/patients', { replace: true })
              }}
              className="btn btn-danger"
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-ink-2">{t('patient.confirmDeleteBody')}</p>
      </Modal>
    </div>
  )
}
