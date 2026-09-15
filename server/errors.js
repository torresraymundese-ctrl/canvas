export class AppError extends Error {
  constructor(code, message, httpStatus = 400, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
