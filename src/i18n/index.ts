import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { km } from './locales/km'

export const LANGUAGES = ['km', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'clinic.lang'

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (isLanguage(saved)) return saved
  // Khmer is the default: this is a Cambodian clinic app, and English is opt-in.
  return navigator.language.startsWith('en') ? 'en' : 'km'
}

i18n.use(initReactI18next).init({
  resources: {
    km: { translation: km },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'km',
  interpolation: { escapeValue: false }, // React already escapes
})

/** Persist the choice and keep `<html lang>` in sync for correct font shaping. */
export function setLanguage(lang: Language) {
  localStorage.setItem(STORAGE_KEY, lang)
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
}

document.documentElement.lang = i18n.language

export default i18n
