import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { requestPersistentStorage } from './db/db'
import { initTheme } from './lib/theme'

// Before the first render, so the app never flashes the wrong theme.
initTheme()

// Ask the browser not to evict this origin's IndexedDB under storage pressure.
// Best-effort only, which is why manual backup still lands in phase 5.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
