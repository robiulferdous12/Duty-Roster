import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import DutyRosterPage from './pages/DutyRosterPage';
import LeaveStatusPage from './pages/LeaveStatusPage';
import ShortLeavePage from './pages/ShortLeavePage';
import OvertimePage from './pages/OvertimePage';
import SummaryPage from './pages/SummaryPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactElement, adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/summary" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/summary" replace />} />
      <Route
        path="/"
        element={<ProtectedRoute><Layout><DutyRosterPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/leave"
        element={<ProtectedRoute><Layout><LeaveStatusPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/short-leave"
        element={<ProtectedRoute><Layout><ShortLeavePage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/overtime"
        element={<ProtectedRoute adminOnly><Layout><OvertimePage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/summary"
        element={<ProtectedRoute><Layout><SummaryPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/settings"
        element={<ProtectedRoute adminOnly><Layout><SettingsPage /></Layout></ProtectedRoute>}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
