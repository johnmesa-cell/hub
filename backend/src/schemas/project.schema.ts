import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  url: z.string().url('URL inválida'),
  description: z.string().max(500).optional().default(''),
  icon: z.string().max(10).optional().default('◆'),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).optional().default(0),
  visibility: z.enum(['public', 'private']).optional().default('private')
});

export const updateProjectSchema = createProjectSchema.partial();
