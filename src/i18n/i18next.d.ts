import type { Translation } from './locales/en'

// Makes `t('drug.fields.code')` autocomplete and typo-check at build time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Translation }
  }
}
