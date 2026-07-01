import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DailyPage } from './pages/DailyPage';
import { CardDetailPage } from './pages/CardDetailPage';
import { BudgetPage } from './pages/BudgetPage';
import { BudgetCardPage } from './pages/BudgetCardPage';
import { SavingsPage } from './pages/SavingsPage';
import { SavingsCardPage } from './pages/SavingsCardPage';
import { SummaryPage } from './pages/SummaryPage';
import { CardsPage } from './pages/CardsPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DailyPage />} />
          <Route path="/card/:id" element={<CardDetailPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/budget/:id" element={<BudgetCardPage />} />
          <Route path="/savings" element={<SavingsPage />} />
          <Route path="/savings/:id" element={<SavingsCardPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
