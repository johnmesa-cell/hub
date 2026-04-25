import { useEffect, useState } from 'react';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import './styles.css';

function AppRouter() {
  const { token } = useAuthContext();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (pathname === '/login') {
    return <Login />;
  }

  if (pathname === '/dashboard') {
    return token ? <Dashboard /> : <Login />;
  }

  return <Home />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
