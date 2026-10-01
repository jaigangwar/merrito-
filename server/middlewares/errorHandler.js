// ===== ERROR HANDLER MIDDLEWARE =====
export const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  // Handle specific error types
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large. Maximum size is 10MB.';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field.';
  }

  // PostgreSQL/Supabase specific errors
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate entry. A record with this data already exists.';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Invalid reference. The referenced record does not exist.';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid data format. Please check your input.';
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = err.errors?.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') || 'Validation failed';
  }

  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body.';
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const notFoundHandler = (req, res, next) => {
  res.status(404).json({ error: `Not Found - ${req.originalUrl}` });
};
