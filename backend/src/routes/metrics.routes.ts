import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getLocalMetrics } from '../services/metrics.local.service';
import { getRemoteMetrics } from '../services/metrics.remote.service';

export const metricsRouter = Router();

metricsRouter.get('/snapshot', requireAuth, async (_request, response, next) => {
  try {
    const [server1, server2] = await Promise.all([Promise.resolve(getLocalMetrics()), getRemoteMetrics()]);
    response.json({ server1, server2 });
  } catch (error) {
    next(error);
  }
});
