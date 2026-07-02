export class AppError extends Error {
  statusCode: number;
  details: object[];

  constructor(message: string, statusCode = 400, details: object[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
