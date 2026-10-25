import { RuntimeClientError } from '../../runtime-client'
import {
  CLI_NAME,
  DEV_CLI_NAME,
  DEV_USER_DATA_DIR_NAME,
  LINUX_CLI_NAME,
  PRODUCT_NAME
} from '../../../shared/product-brand'

export function resolveCompatibilityCliCommand(): string {
  const configured = process.env.ORCA_CLI_COMMAND
  if (configured && [CLI_NAME, LINUX_CLI_NAME, DEV_CLI_NAME].includes(configured)) {
    return configured
  }
  return process.platform === 'linux' ? LINUX_CLI_NAME : CLI_NAME
}

export function resolvePackagedWindowsCompatibilityCommand(): string | undefined {
  if (process.env.ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.ORCA_CLI_COMMAND
  if (command && [CLI_NAME, LINUX_CLI_NAME].includes(command)) {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `The packaged ${PRODUCT_NAME} launcher did not provide a valid resume command. No question was created.`
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.ORCA_DEV_CLI_INVOCATION === '1' ||
    (process.env.ORCA_USER_DATA_PATH?.includes(DEV_USER_DATA_DIR_NAME) ?? false)
  )
}
