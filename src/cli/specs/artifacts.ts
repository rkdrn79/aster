import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

const CLOUD_FLAGS = ['api-url']

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'share'],
    summary: `Share an HTML or Markdown file with your ${PRODUCT_NAME} account`,
    usage: `${CLI_NAME} artifacts share <file> [--api-url <url>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: [
      `${CLI_NAME} artifacts share ./report.html`,
      `${CLI_NAME} artifacts share ./notes.md --json`
    ]
  },
  {
    path: ['artifacts', 'update'],
    summary: `Update a file previously shared from this ${PRODUCT_NAME} profile`,
    usage: `${CLI_NAME} artifacts update <file> [--api-url <url>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Delete the artifact associated with a previously shared file',
    usage: `${CLI_NAME} artifacts unshare <file> [--api-url <url>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: `List artifacts owned by the signed-in ${PRODUCT_NAME} account`,
    usage: `${CLI_NAME} artifacts list [--cursor <cursor>] [--api-url <url>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'cursor']
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: `Delete an artifact owned by the signed-in ${PRODUCT_NAME} account`,
    usage: `${CLI_NAME} artifacts delete <id> [--api-url <url>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...CLOUD_FLAGS, 'id'],
    positionalArgs: ['id']
  }
]
