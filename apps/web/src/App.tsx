import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DailyPage } from './pages/DailyPage';
import { BudgetPage } from './pages/BudgetPage';
import { SummaryPage } from './pages/SummaryPage';
import { CardsPage } from './pages/CardsPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DailyPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
