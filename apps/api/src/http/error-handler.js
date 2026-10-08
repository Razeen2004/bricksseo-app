import { AppError } from '../lib/errors.js';

export function errorHandler(error, request, reply) {
  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      request.log.error(error);
    }
    return reply.status(error.httpStatus).send({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  // Zod validation errors from Fastify
  if (error.validation) {
    return reply.status(400).send({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Invalid request data',
        details: error.validation
      }
    });
  }

  // Unhandled errors
  request.log.error(error);
  return reply.status(500).send({
    ok: false,
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred',
      details: { requestId: request.id }
    }
  });
}
