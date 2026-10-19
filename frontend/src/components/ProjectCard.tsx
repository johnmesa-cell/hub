import type { Project } from '../types';

export function ProjectCard({ project }: { project: Project }) {
  return (
    <a className="project-card" href={project.url} target="_blank" rel="noreferrer">
      <div className="project-icon">{project.icon ?? '◌'}</div>
      <div>
        <h3>{project.name}</h3>
        <p>{project.description ?? 'Sin descripción'}</p>
      </div>
      {project.visibility === 'private' && <span className="project-visibility">Privado</span>}
      <span className="project-link">Abrir</span>
    </a>
  );
}
