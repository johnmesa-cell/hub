import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="page page-auth">
      <section className="auth-card">
        <span className="eyebrow">Acceso administrativo</span>
        <h1>Iniciar sesión</h1>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await login(username, password);
              navigate('/dashboard');
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No se pudo autenticar');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label>
            Usuario
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
