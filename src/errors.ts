export class InputError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function isInputError(error: unknown): error is InputError {
  return error instanceof InputError;
}
