import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));
      response.status(422).json({ error: 'Datos inválidos', details: errors });
      return;
    }

    request.body = result.data;
    next();
  };
}
