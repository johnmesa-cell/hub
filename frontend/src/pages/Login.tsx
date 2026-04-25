import { useAuth } from '../hooks/useAuth';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Login() {
  const { loginWithGoogle, loading } = useAuth();

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <main className="page page-auth">
      <section className="auth-card">
        <span className="eyebrow">Acceso administrativo</span>
        <h1>Iniciar sesión</h1>
        <button
          className="primary"
          onClick={() => void handleGoogleLogin()}
          disabled={loading}
          style={{ width: '100%', marginTop: '1rem' }}
        >
          {loading ? 'Conectando...' : '🔐 Continuar con Google'}
        </button>
      </section>
    </main>
  );
}
