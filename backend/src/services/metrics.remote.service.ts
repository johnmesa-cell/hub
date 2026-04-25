import { env } from '../config/env';
import type { ServerMetrics } from '../types';
import { getLocalMetrics } from './metrics.local.service';

export async function getRemoteMetrics(): Promise<ServerMetrics> {
  if (!env.agentUrl) {
    return getLocalMetrics();
  }

  try {
    const response = await fetch(new URL('/metrics', env.agentUrl), {
      headers: {
        'X-Agent-Key': env.agentKey
      }
    });

    if (!response.ok) {
      return getLocalMetrics();
    }

    return (await response.json()) as ServerMetrics;
  } catch {
    return getLocalMetrics();
  }
}
