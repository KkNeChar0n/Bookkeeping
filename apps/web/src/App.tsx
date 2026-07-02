import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DailyPage } from './pages/DailyPage';
import { CardDetailPage } from './pages/CardDetailPage';
import { BudgetPage } from './pages/BudgetPage';
import { BudgetCardPage } from './pages/BudgetCardPage';
import { BudgetEditPage } from './pages/BudgetEditPage';
import { SavingsPage } from './pages/SavingsPage';
import { SavingsCardPage } from './pages/SavingsCardPage';
import { FundPage } from './pages/FundPage';
import { SummaryPage } from './pages/SummaryPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DailyPage />} />
          <Route path="/card/:id" element={<CardDetailPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/budget/:id" element={<BudgetCardPage />} />
          <Route path="/budget/:id/edit" element={<BudgetEditPage />} />
          <Route path="/savings" element={<SavingsPage />} />
          <Route path="/savings/:id" element={<SavingsCardPage />} />
          <Route path="/fund" element={<FundPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
