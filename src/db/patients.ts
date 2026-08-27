import { db, type PatientRow } from './db'
import { newId } from '../lib/id'
import { buildSearchTokens, compareKhmer, normalize } from '../lib/search'
import { daysUntil } from '../lib/dates'
import type { BaseRecord, Drug, Id, Patient } from './types'
import type { Language } from '../i18n'

export type PatientInput = Omit<Patient, keyof BaseRecord>

export function emptyPatientInput(): PatientInput {
  return {
    code: '',
    nameKh: '',
    nameEn: '',
    sex: 'female',
    dob: '',
    phone: '',
    address: '',
    allergies: [],
    note: '',
  }
}

export function patientDisplayName(patient: Patient, lang: Language): string {
  const [primary, secondary] =
    lang === 'km' ? [patient.nameKh, patient.nameEn] : [patient.nameEn, patient.nameKh]
  return primary.trim() || secondary.trim() || patient.code
}

/** Whole years, or months when under one year — how paediatric age is spoken. */
export function ageOf(patient: Patient): { years: number; months: number } | undefined {
  if (!patient.dob) return undefined
  const days = -daysUntil(patient.dob)
  if (days < 0) return undefined
  return { years: Math.floor(days / 365.25), months: Math.floor(days / 30.44) }
}

function tokens(patient: PatientInput): string[] {
  return buildSearchTokens(patient.code, patient.nameKh, patient.nameEn, patient.phone)
}

/** The next free sequential code, so staff never have to invent one. */
export async function nextPatientCode(): Promise<string> {
  const patients = await db.patients.toArray()
  const highest = patients.reduce((max, patient) => {
    const match = /^P(\d+)$/.exec(patient.code)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `P${String(highest + 1).padStart(4, '0')}`
}

export async function searchPatients(query: string, lang: Language = 'km'): Promise<Patient[]> {
  const q = normalize(query)
  const rows = q
    ? await db.patients.where('searchText').startsWith(q).distinct().toArray()
    : await db.patients.toArray()

  return rows
    .filter((patient) => !patient.deletedAt)
    .sort((a, b) => compareKhmer(patientDisplayName(a, lang), patientDisplayName(b, lang)))
}

export async function createPatient(input: PatientInput): Promise<Id> {
  const now = new Date().toISOString()
  const patient: Patient = {
    ...input,
    code: input.code.trim() || (await nextPatientCode()),
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.patients.add({ ...patient, searchText: tokens(patient) } as PatientRow)
  return patient.id
}

export async function updatePatient(id: Id, input: PatientInput): Promise<void> {
  const existing = await db.patients.get(id)
  if (!existing) throw new Error(`Patient ${id} not found`)
  const updated: Patient = { ...existing, ...input, id, updatedAt: new Date().toISOString() }
  await db.patients.put({ ...updated, searchText: tokens(updated) } as PatientRow)
}

export async function deletePatient(id: Id): Promise<void> {
  const now = new Date().toISOString()
  await db.patients.update(id, { deletedAt: now, updatedAt: now })
}

/**
 * Does anything the patient is recorded as allergic to appear in this drug?
 *
 * Deliberately a loose substring match over the generic name, brand names and
 * classes: "penicillin" has to catch "Amoxicillin" and "Penicillins, Amino".
 * A false warning costs a moment's thought; a missed one can kill, so this errs
 * heavily toward warning.
 */
export function allergyMatches(patient: Patient, drug: Drug): string[] {
  const haystack = normalize(
    [drug.generic, drug.nameEn, drug.nameKh, ...(drug.brandNames ?? []), ...(drug.classes ?? [])]
      .filter(Boolean)
      .join(' '),
  )
  return (patient.allergies ?? []).filter((allergy) => {
    const needle = normalize(allergy)
    return needle.length >= 3 && haystack.includes(needle)
  })
}
