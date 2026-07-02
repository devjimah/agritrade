export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  statusCode: number;
  details: ErrorDetail[];

  constructor(message: string, statusCode = 400, details: ErrorDetail[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
