import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { auditAction } from '../middleware/audit.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';
import {
  listProjects,
  createProject,
  updateProject,
  deactivateProject,
} from '../firestore/projects.firestore';

export const projectsRouter = Router();

// GET /projects — público
projectsRouter.get('/', async (_request, response, next) => {
  try {
    const projects = await listProjects();
    response.json({ projects });
  } catch (err) {
    next(err);
  }
});

// POST /projects — requiere auth
projectsRouter.post(
  '/',
  requireAuth,
  auditAction('PROJECT_CREATE'),
  validate(createProjectSchema),
  async (request, response, next) => {
    try {
      const project = await createProject(request.body);
      response.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /projects/:id — requiere auth (id = slug del documento Firestore)
projectsRouter.put(
  '/:id',
  requireAuth,
  auditAction('PROJECT_UPDATE'),
  validate(updateProjectSchema),
  async (request, response, next) => {
    try {
      const updated = await updateProject(String(request.params.id), request.body);
      if (!updated) {
        response.status(404).json({ error: 'Project not found' });
        return;
      }
      response.json({ project: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id — requiere auth (id = slug del documento Firestore)
projectsRouter.delete(
  '/:id',
  requireAuth,
  auditAction('PROJECT_DELETE'),
  async (request, response, next) => {
    try {
      const deleted = await deactivateProject(String(request.params.id));
      if (!deleted) {
        response.status(404).json({ error: 'Project not found' });
        return;
      }
      response.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
