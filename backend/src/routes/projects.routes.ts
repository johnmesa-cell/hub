import { Router } from 'express';
import { createProject, deactivateProject, listProjects, updateProject } from '../db/database';
import { requireAuth } from '../middleware/auth.middleware';

export const projectsRouter = Router();

projectsRouter.get('/', (_request, response) => {
  response.json({ projects: listProjects() });
});

projectsRouter.post('/', requireAuth, (request, response) => {
  const project = request.body as {
    name?: string;
    slug?: string;
    url?: string;
    description?: string;
    icon?: string;
    active?: number;
    sort_order?: number;
  };

  if (!project.name || !project.slug || !project.url) {
    response.status(400).json({ error: 'name, slug and url are required' });
    return;
  }

  const created = createProject({
    name: project.name,
    slug: project.slug,
    url: project.url,
    description: project.description ?? null,
    icon: project.icon ?? null,
    active: project.active ?? 1,
    sort_order: project.sort_order ?? 0
  });

  response.status(201).json({ project: created });
});

projectsRouter.put('/:id', requireAuth, (request, response) => {
  const id = Number(request.params.id);
  const updated = updateProject(id, request.body as Record<string, unknown>);

  if (!updated) {
    response.status(404).json({ error: 'Project not found' });
    return;
  }

  response.json({ project: updated });
});

projectsRouter.delete('/:id', requireAuth, (request, response) => {
  const id = Number(request.params.id);
  const deleted = deactivateProject(id);

  if (!deleted) {
    response.status(404).json({ error: 'Project not found' });
    return;
  }

  response.status(204).send();
});
