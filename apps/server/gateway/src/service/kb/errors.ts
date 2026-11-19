export class KbConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KbConflictError'
  }
}
