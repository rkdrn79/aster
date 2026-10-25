export class HarnessError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HarnessError'
    this.code = code
  }
}

const systemErrorCodes = {
  ENOENT: 'not_found',
  EEXIST: 'already_exists',
  EACCES: 'permission_denied',
  EPERM: 'permission_denied'
}

export function harnessErrorCode(error) {
  if (error instanceof HarnessError) {
    return error.code
  }
  if (error instanceof SyntaxError) {
    return 'invalid_json'
  }
  return systemErrorCodes[error?.code] ?? 'error'
}
