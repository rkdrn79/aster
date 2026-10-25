import { lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { ResearchProjectTransferRequest } from '../../shared/research/research-project-transfer'

const MAX_FILES = 10_000
const MAX_BYTES = 10 * 1024 * 1024 * 1024
const MAX_VISITED = 30_000

export type TransferFile = { relativePath: string; size: number; sourcePath: string }
export type TransferScan = { files: TransferFile[]; skipped: string[]; bytes: number }

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function skipName(name: string): boolean {
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === '.ssh' ||
    name === '.env' ||
    name.startsWith('.env.')
  )
}

function checkScan(scan: TransferScan, visited: number): void {
  if (scan.files.length > MAX_FILES || scan.bytes > MAX_BYTES || visited > MAX_VISITED) {
    throw new Error(
      'Transfer exceeds 10,000 files, 10 GiB or 30,000 directory entries. Choose smaller paths.'
    )
  }
}

export function remoteRealpath(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((done, fail) =>
    sftp.realpath(path, (error, resolved) => (error ? fail(error) : done(resolved)))
  )
}

export function remoteStat(
  sftp: SFTPWrapper,
  path: string
): Promise<{ file: boolean; directory: boolean; symlink: boolean; size: number }> {
  return new Promise((done, fail) =>
    sftp.lstat(path, (error, stat) => {
      if (error) {
        fail(error)
      } else {
        done({
          file: stat.isFile(),
          directory: stat.isDirectory(),
          symlink: stat.isSymbolicLink(),
          size: stat.size
        })
      }
    })
  )
}

function remoteEntries(sftp: SFTPWrapper, path: string): Promise<string[]> {
  return new Promise((done, fail) =>
    sftp.readdir(path, (error, entries) => {
      if (error) {
        fail(error)
        return
      }
      const names = entries
        .map((entry) => entry.filename)
        .filter((name) => name !== '.' && name !== '..')
      if (
        names.some(
          (name) => !name || name.includes('/') || name.includes('\\') || name.includes('\0')
        )
      ) {
        fail(new Error('The host returned an invalid file name.'))
        return
      }
      done(names.sort())
    })
  )
}

async function scanLocal(root: string, paths: readonly string[]): Promise<TransferScan> {
  const scan: TransferScan = { files: [], skipped: [], bytes: 0 }
  const seen = new Set<string>()
  let visited = 0
  const visit = async (relativePath: string, explicit: boolean): Promise<void> => {
    visited += 1
    checkScan(scan, visited)
    const parts = relativePath.split('/')
    if (parts.length > 64) {
      throw new Error('Transfer path is too deep.')
    }
    if (parts.some(skipName)) {
      if (explicit) {
        throw new Error(`${relativePath} is excluded from project transfer.`)
      }
      scan.skipped.push(relativePath)
      return
    }
    const path = resolve(root, ...parts)
    if (!inside(root, path)) {
      throw new Error('Transfer path escapes the project.')
    }
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) {
      if (explicit) {
        throw new Error(`${relativePath} is a symbolic link.`)
      }
      scan.skipped.push(relativePath)
      return
    }
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) {
        await visit(`${relativePath}/${entry}`, false)
      }
      return
    }
    if (!stat.isFile()) {
      scan.skipped.push(relativePath)
      return
    }
    if (seen.has(relativePath)) {
      return
    }
    const canonical = await realpath(path)
    if (!inside(root, canonical)) {
      throw new Error('Transfer path escapes the project.')
    }
    seen.add(relativePath)
    scan.files.push({ relativePath, size: stat.size, sourcePath: path })
    scan.bytes += stat.size
    checkScan(scan, visited)
  }
  for (const path of paths) {
    await visit(path, true)
  }
  return scan
}

async function scanRemote(
  sftp: SFTPWrapper,
  root: string,
  paths: readonly string[]
): Promise<TransferScan> {
  const scan: TransferScan = { files: [], skipped: [], bytes: 0 }
  const seen = new Set<string>()
  let visited = 0
  const visit = async (relativePath: string, explicit: boolean): Promise<void> => {
    visited += 1
    checkScan(scan, visited)
    const parts = relativePath.split('/')
    if (parts.length > 64) {
      throw new Error('Transfer path is too deep.')
    }
    if (parts.some(skipName)) {
      if (explicit) {
        throw new Error(`${relativePath} is excluded from project transfer.`)
      }
      scan.skipped.push(relativePath)
      return
    }
    const path = posix.join(root, ...parts)
    if (!path.startsWith(`${root.replace(/\/+$/, '')}/`)) {
      throw new Error('Transfer path escapes the host folder.')
    }
    const stat = await remoteStat(sftp, path)
    if (stat.symlink) {
      if (explicit) {
        throw new Error(`${relativePath} is a symbolic link.`)
      }
      scan.skipped.push(relativePath)
      return
    }
    const canonical = await remoteRealpath(sftp, path)
    if (!canonical.startsWith(`${root.replace(/\/+$/, '')}/`)) {
      throw new Error('Transfer path escapes the host folder.')
    }
    if (stat.directory) {
      for (const entry of await remoteEntries(sftp, path)) {
        await visit(`${relativePath}/${entry}`, false)
      }
      return
    }
    if (!stat.file) {
      scan.skipped.push(relativePath)
      return
    }
    if (seen.has(relativePath)) {
      return
    }
    seen.add(relativePath)
    scan.files.push({ relativePath, size: stat.size, sourcePath: path })
    scan.bytes += stat.size
    checkScan(scan, visited)
  }
  for (const path of paths) {
    await visit(path, true)
  }
  return scan
}

export function scanResearchTransfer(
  request: ResearchProjectTransferRequest,
  roots: { local: string; remote: string; sftp: SFTPWrapper }
): Promise<TransferScan> {
  return request.direction === 'push'
    ? scanLocal(roots.local, request.paths)
    : scanRemote(roots.sftp, roots.remote, request.paths)
}
