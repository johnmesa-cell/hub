import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { NavBar } from '../components/NavBar';
import { ProjectCard } from '../components/ProjectCard';
import type { Project } from '../types';
import { useAuth } from '../hooks/useAuth';

export function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    void apiRequest<{ projects: Project[] }>('/projects', undefined, { redirectOn401: false })
      .then((response) => setProjects(response.projects))
      .catch(() => setProjects([]));
  }, [loading, user]);

  return (
    <div className="app-shell">
      <NavBar />
      <main className="page page-home">
        <section className="hero">
          <span className="eyebrow">Portal central</span>
          <h1>Un punto de entrada limpio para todos los proyectos.</h1>
          <p>Acceso público a los servicios del dominio y administración privada para métricas y control operativo.</p>
        </section>

        <section className="project-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      </main>
    </div>
  );
}
