// One catchable base for every design-compatibility failure.
//
// A caller that wants to handle "this design cannot be used" should not have to
// know whether the problem was found by the envelope parser or by the schema 2
// validator, so the specific errors extend this rather than sitting beside it.
export class BylineDesignCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignCompatibilityError";
  }
}
