import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import DutyRosterPage from './pages/DutyRosterPage';
import LeaveStatusPage from './pages/LeaveStatusPage';
import ShortLeavePage from './pages/ShortLeavePage';
import OvertimePage from './pages/OvertimePage';
import SummaryPage from './pages/SummaryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Layout>
          <Routes>
            <Route path="/"         element={<DutyRosterPage />} />
            <Route path="/leave"    element={<LeaveStatusPage />} />
            <Route path="/short-leave" element={<ShortLeavePage />} />
            <Route path="/overtime" element={<OvertimePage />} />
            <Route path="/summary" element={<SummaryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </AppProvider>
    </BrowserRouter>
  );
}
