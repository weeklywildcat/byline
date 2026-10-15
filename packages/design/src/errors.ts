// Base error for invalid internal homepage package configuration.
export class BylineDesignCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignCompatibilityError";
  }
}
