import { Router } from 'express';
import { auditAction } from '../middleware/audit.middleware';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProject, deactivateProject, listProjects, updateProject } from '../firestore/projects.firestore';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';

export const projectsRouter = Router();

projectsRouter.get('/', optionalAuth, async (request, response, next) => {
  try {
    const includeInactive = request.query.all === 'true' && Boolean(request.firebaseUser);
    const projects = await listProjects({ includeInactive, publicOnly: !request.firebaseUser });
    response.json({ projects });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post('/', requireAuth, auditAction('PROJECT_CREATE'), validate(createProjectSchema), async (request, response, next) => {
  try {
    const project = await createProject(request.body);
    response.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.put('/:id', requireAuth, auditAction('PROJECT_UPDATE'), validate(updateProjectSchema), async (request, response, next) => {
  try {
    const project = await updateProject(String(request.params.id), request.body);
    if (!project) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }
    response.json({ project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.delete('/:id', requireAuth, auditAction('PROJECT_DELETE'), async (request, response, next) => {
  try {
    if (!(await deactivateProject(String(request.params.id)))) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
