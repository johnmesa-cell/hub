import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { ServerPanel } from '../components/ServerPanel';
import { useAuth } from '../hooks/useAuth';
import { useMetricsSocket } from '../hooks/useMetricsSocket';
import type { Project } from '../types';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const { metrics, connected } = useMetricsSocket();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    void apiRequest<{ projects: Project[] }>('/projects')
      .then((response) => setProjects(response.projects))
      .catch(() => setProjects([]));
  }, [user]);

  if (!user) {
    return null;
  }

  const displayName = user.displayName ?? user.email ?? 'usuario';

  return (
    <main className="page page-dashboard">
      <section className="dashboard-top">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>Control en tiempo real</h1>
          <p>
            Sesión activa como {displayName} · {connected ? 'WebSocket conectado' : 'Conectando...'}
          </p>
        </div>
        <button
          className="ghost"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Cerrar sesión
        </button>
      </section>

      {metrics ? (
        <section className="server-layout">
          <ServerPanel title="Servidor 1" metrics={metrics.server1} />
          <ServerPanel title="Servidor 2" metrics={metrics.server2} />
        </section>
      ) : (
        <section className="empty-state">Esperando métricas...</section>
      )}

      <section className="projects-section">
        <h2>Proyectos</h2>
        <div className="projects-list">
          {projects.map((project) => (
            <div className="project-row" key={project.id}>
              <span>{project.icon ?? '◌'}</span>
              <div>
                <strong>{project.name}</strong>
                <p>{project.description ?? 'Sin descripción'}</p>
              </div>
              <span className={project.active ? 'status ok' : 'status danger'}>
                {project.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
