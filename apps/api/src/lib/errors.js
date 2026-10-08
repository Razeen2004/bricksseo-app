export class AppError extends Error {
  constructor(code, httpStatus = 500, message, details = null) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = 'AppError';
  }
}
