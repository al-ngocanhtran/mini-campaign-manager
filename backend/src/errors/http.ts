export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends HttpError {
  constructor(fields: Record<string, string>) {
    super(400, "Validation failed", fields);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnprocessableError extends HttpError {
  constructor(message: string) {
    super(422, message);
  }
}
