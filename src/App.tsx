import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DrugsPage } from './pages/DrugsPage'
import { DrugDetailPage } from './pages/DrugDetailPage'
import { MonographSectionPage } from './pages/MonographSectionPage'
import { StockPage } from './pages/StockPage'
import { DrugStockPage } from './pages/DrugStockPage'
import { PatientsPage } from './pages/PatientsPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { DispensePage } from './pages/DispensePage'
import { PhasePlaceholder } from './pages/PhasePlaceholder'
import { SettingsPage } from './pages/SettingsPage'

/**
 * Hash routing on purpose: the built app has to work from any static host and
 * from the service-worker cache with no server-side rewrite rules.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/drugs" replace />} />
          <Route path="/drugs" element={<DrugsPage />} />
          <Route path="/drugs/:id" element={<DrugDetailPage />} />
          <Route path="/drugs/:id/:section" element={<MonographSectionPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/:id" element={<DrugStockPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/dispense" element={<DispensePage />} />
          <Route path="/dispense/:patientId" element={<DispensePage />} />
          <Route path="/reports" element={<PhasePlaceholder messageKey="reports" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/drugs" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
