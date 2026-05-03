import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChildrenListPage } from './pages/ChildrenListPage';
import { ChildDetailPage } from './pages/ChildDetailPage';
import { ChildAppPage } from './pages/ChildAppPage';
import { AlertsPage } from './pages/AlertsPage';
import { AssistantPage } from './pages/AssistantPage';
import { AuditPage } from './pages/AuditPage';
import { AdminPage } from './pages/AdminPage';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full grid place-items-center text-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'school_admin') return <Navigate to="/admin" replace />;
  return <DashboardPage />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/children" element={<ChildrenListPage />} />
          <Route path="/children/:id" element={<ChildDetailPage />} />
          <Route path="/children/:id/child-app" element={<ChildAppPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
