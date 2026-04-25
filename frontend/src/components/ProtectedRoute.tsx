import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Login } from '../pages/Login';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <span>Verificando sesión...</span>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}
