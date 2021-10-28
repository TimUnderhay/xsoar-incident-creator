export class BaseError extends Error {
  constructor(name: string, msg?: any) {
    super(msg || name);
    this.name = name;
  }
}

export class FileNotFoundError extends BaseError {
  constructor(msg?: any) {
    super('FileNotFoundError', msg);
  }
}