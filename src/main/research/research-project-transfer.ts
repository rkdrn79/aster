import { lstat, mkdir, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type {
  ResearchProjectTransferPreview,
  ResearchProjectTransferRequest,
  ResearchProjectTransferResult
} from '../../shared/research/research-project-transfer'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import {
  getSshConnectionManager,
  listRegisteredSshTargets
} from '../ssh/targets/ssh-target-registry'
import { knownSshHostPlatform } from '../ssh/ssh-host-platform-memo'
import { fastGetViaSftp } from '../providers/ssh-filesystem-provider-sftp'
import { uploadBuffer, uploadFile } from '../ssh/sftp-upload'
import { readResearchComputeLinks } from './research-compute-links-repository'
import {
  remoteRealpath,
  remoteStat,
  scanResearchTransfer,
  type TransferScan
} from './research-project-transfer-scan'

const MAX_PREVIEW_PATHS = 30

type TransferRoots = {
  local: string
  remote: string
  hostLabel: string
  sftp: SFTPWrapper
}

function remoteMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((done, fail) => sftp.mkdir(path, (error) => (error ? fail(error) : done())))
}

function remoteRename(sftp: SFTPWrapper, source: string, destination: string): Promise<void> {
  return new Promise((done, fail) =>
    sftp.rename(source, destination, (error) => (error ? fail(error) : done()))
  )
}

async function rootsFor(request: ResearchProjectTransferRequest): Promise<TransferRoots> {
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready.')
  }
  const link = (await readResearchComputeLinks()).links.find((entry) => entry.id === request.linkId)
  if (!link) {
    throw new Error('The project host folder is no longer linked.')
  }
  if (knownSshHostPlatform(link.targetId)?.os === 'win32') {
    throw new Error('Project transfer currently requires a Linux or POSIX SSH host.')
  }
  const local = await realpath(await resolveDesktopAuthorizedPath(request.localRoot, store))
  if (!(await lstat(local)).isDirectory()) {
    throw new Error('Choose a local project folder.')
  }
  const connection = getSshConnectionManager()?.getConnection(link.targetId)
  if (connection?.getState().status !== 'connected') {
    throw new Error('Connect the project host in Aster before transferring files.')
  }
  const sftp = await connection.sftp()
  try {
    const remote = await remoteRealpath(sftp, link.remotePath)
    if (remote === '/') {
      throw new Error('The linked host folder cannot resolve to /.')
    }
    if (!(await remoteStat(sftp, remote)).directory) {
      throw new Error('The linked host path is not a directory.')
    }
    const hostLabel =
      listRegisteredSshTargets().find((entry) => entry.id === link.targetId)?.label ?? link.targetId
    return { local, remote, hostLabel, sftp }
  } catch (error) {
    sftp.end()
    throw error
  }
}

export async function previewResearchProjectTransfer(
  request: ResearchProjectTransferRequest
): Promise<ResearchProjectTransferPreview> {
  const roots = await rootsFor(request)
  try {
    const scan = await scanResearchTransfer(request, roots)
    return {
      direction: request.direction,
      hostLabel: roots.hostLabel,
      sourceRoot: request.direction === 'push' ? roots.local : roots.remote,
      destinationRoot: request.direction === 'push' ? roots.remote : roots.local,
      files: scan.files.length,
      bytes: scan.bytes,
      paths: scan.files.slice(0, MAX_PREVIEW_PATHS).map((file) => file.relativePath),
      truncated: scan.files.length > MAX_PREVIEW_PATHS,
      skipped: scan.skipped.slice(0, MAX_PREVIEW_PATHS),
      skippedCount: scan.skipped.length
    }
  } finally {
    roots.sftp.end()
  }
}

async function pushFiles(
  roots: TransferRoots,
  scan: TransferScan,
  destination: string
): Promise<void> {
  const created = new Set([destination])
  for (const file of scan.files) {
    const segments = file.relativePath.split('/').slice(0, -1)
    let parent = destination
    for (const segment of segments) {
      parent = posix.join(parent, segment)
      if (!created.has(parent)) {
        await remoteMkdir(roots.sftp, parent)
        created.add(parent)
      }
    }
    const before = await lstat(file.sourcePath)
    if (!before.isFile() || before.size !== file.size) {
      throw new Error(`${file.relativePath} changed since the transfer scan.`)
    }
    await uploadFile(roots.sftp, file.sourcePath, posix.join(destination, file.relativePath), {
      exclusive: true
    })
    const after = await lstat(file.sourcePath)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error(`${file.relativePath} changed while it was being transferred.`)
    }
  }
}

async function pullFiles(
  roots: TransferRoots,
  scan: TransferScan,
  destination: string
): Promise<void> {
  for (const file of scan.files) {
    const current = await remoteStat(roots.sftp, file.sourcePath)
    const canonical = await remoteRealpath(roots.sftp, file.sourcePath)
    if (
      !current.file ||
      current.symlink ||
      current.size !== file.size ||
      !canonical.startsWith(`${roots.remote.replace(/\/+$/, '')}/`)
    ) {
      throw new Error(`${file.relativePath} changed since the transfer scan.`)
    }
    const target = join(destination, ...file.relativePath.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await fastGetViaSftp(roots.sftp, file.sourcePath, target)
    if ((await lstat(target)).size !== file.size) {
      throw new Error(`${file.relativePath} changed while it was being transferred.`)
    }
  }
}

export async function transferResearchProject(
  request: ResearchProjectTransferRequest
): Promise<ResearchProjectTransferResult> {
  const roots = await rootsFor(request)
  try {
    const scan = await scanResearchTransfer(request, roots)
    if (!scan.files.length) {
      throw new Error('The selected paths contain no transferable files.')
    }
    const id = crypto.randomUUID()
    const name = `.aster-${request.direction}-${id}`
    const destination =
      request.direction === 'push' ? posix.join(roots.remote, name) : join(roots.local, name)
    const partial = `${destination}.partial`
    if (request.direction === 'push') {
      await remoteMkdir(roots.sftp, partial)
      await pushFiles(roots, scan, partial)
      await uploadBuffer(
        roots.sftp,
        Buffer.from(
          JSON.stringify(
            {
              direction: 'push',
              createdAt: new Date().toISOString(),
              paths: request.paths,
              files: scan.files.length,
              bytes: scan.bytes
            },
            null,
            2
          )
        ),
        posix.join(partial, '.aster-transfer.json'),
        { exclusive: true }
      )
      await remoteRename(roots.sftp, partial, destination)
    } else {
      await mkdir(partial)
      await pullFiles(roots, scan, partial)
      await writeFile(
        join(partial, '.aster-transfer.json'),
        JSON.stringify(
          {
            direction: 'pull',
            host: roots.hostLabel,
            createdAt: new Date().toISOString(),
            paths: request.paths,
            files: scan.files.length,
            bytes: scan.bytes
          },
          null,
          2
        ),
        { flag: 'wx' }
      )
      await rename(partial, destination)
    }
    return {
      destinationPath: destination,
      files: scan.files.length,
      bytes: scan.bytes,
      completedAt: new Date().toISOString()
    }
  } finally {
    roots.sftp.end()
  }
}
