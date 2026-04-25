import { Router } from 'express';
import { createProject, deactivateProject, listProjects, updateProject } from '../db/database';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';

export const projectsRouter = Router();

projectsRouter.get('/', (_request, response) => {
  response.json({ projects: listProjects() });
});

projectsRouter.post(
  '/',
  requireAuth,
  validate(createProjectSchema),
  (request, response) => {
    const uid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.socket.remoteAddress ?? 'unknown';

    const { writeAuditLog } = require('../db/database');
    writeAuditLog(uid, 'PROJECT_CREATE', ip);

    const project = request.body as {
      name: string;
      slug: string;
      url: string;
      description: string;
      icon: string;
      active: number;
      sort_order: number;
    };

    const created = createProject({
      name: project.name,
      slug: project.slug,
      url: project.url,
      description: project.description,
      icon: project.icon,
      active: project.active,
      sort_order: project.sort_order
    });

    response.status(201).json({ project: created });
  }
);

projectsRouter.put(
  '/:id',
  requireAuth,
  validate(updateProjectSchema),
  (request, response) => {
    const uid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.socket.remoteAddress ?? 'unknown';

    const { writeAuditLog } = require('../db/database');
    writeAuditLog(uid, 'PROJECT_UPDATE', ip);

    const id = Number(request.params.id);
    const updated = updateProject(id, request.body as Record<string, unknown>);

    if (!updated) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    response.json({ project: updated });
  }
);

projectsRouter.delete(
  '/:id',
  requireAuth,
  (request, response) => {
    const uid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.socket.remoteAddress ?? 'unknown';

    const { writeAuditLog } = require('../db/database');
    writeAuditLog(uid, 'PROJECT_DELETE', ip);

    const id = Number(request.params.id);
    const deleted = deactivateProject(id);

    if (!deleted) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    response.status(204).send();
  }
);
