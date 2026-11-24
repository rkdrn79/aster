import { spawnSync } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { recordPathsOutsideCode } from './research-catalog.mjs'
import { HARNESS_SOURCE } from './research-run-manifest.mjs'
import { sha256OfBuffer } from './research-file-transactions.mjs'

export const CODE_PATCH_FILE = 'code.patch'
const MAX_PATCH_BYTES = 5 * 1024 * 1024
const MAX_UNTRACKED_FILE_BYTES = 256 * 1024
const MAX_UNTRACKED_FILES_WITH_CONTENT = 100
const MAX_UNTRACKED_FILES_LISTED = 500
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024

function runGit(directory, args) {
  // Why: Windows resolves a bare `git` in the spawn cwd first, so never spawn inside the user's tree.
  const result = spawnSync('git', ['-C', directory, ...args], {
    cwd: import.meta.dirname,
    encoding: 'buffer',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    windowsHide: true,
    // Why: provenance capture must not refresh or lock the user's index.
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
  })
  if (result.error?.code === 'ENOBUFS') {
    return { output: result.stdout ?? Buffer.alloc(0), truncated: true }
  }
  if (result.error || result.status !== 0) {
    return null
  }
  return { output: result.stdout, truncated: false }
}

function gitText(directory, args) {
  return runGit(directory, args)?.output.toString('utf8').trim() || null
}

/** Whether git tracks anything at a project-relative path; false outside a repository. */
export function gitTracksPath(project, relativePath) {
  return Boolean(runGit(project, ['ls-files', '-z', '--', relativePath])?.output.length)
}

/**
 * `git mv` for `migrate`: unlike the read-only calls above it writes the index, so a tracked file
 * stays tracked even when its new folder is git-ignored. Returns git's error text, or null.
 */
export function gitMovePath(project, from, to) {
  const result = spawnSync('git', ['-C', project, 'mv', '--', from, to], {
    cwd: import.meta.dirname,
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) {
    return result.error.message
  }
  return result.status === 0 ? null : result.stderr.trim() || `git mv exited with ${result.status}`
}

/**
 * The record tree and the manuscript are not code; editing the paper or recording Runs must not
 * mark every launch dirty. `excluded` holds project-relative `/` paths from recordPathsOutsideCode.
 */
function codePathspecs(toplevel, project, excluded) {
  const relative = path.relative(toplevel, project)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return ['.']
  }
  const prefix = relative ? `${relative.split(path.sep).join('/')}/` : ''
  // Why literal: catalog paths are user-chosen, so `*` or `[` in a folder name must not glob.
  return ['.', ...excluded.map((item) => `:(exclude,literal)${prefix}${item.path}`)]
}

function newFileDiff(relativePath, content) {
  const text = content.toString('utf8')
  const lines = text.split('\n')
  const endsWithNewline = text.endsWith('\n')
  if (endsWithNewline) {
    lines.pop()
  }
  const body = lines.map((line) => `+${line}`).join('\n')
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    ...(endsWithNewline ? [] : ['\\ No newline at end of file']),
    ''
  ].join('\n')
}

async function untrackedSection(toplevel, files, budget) {
  const included = []
  const listed = []
  let used = 0
  for (const relativePath of files.slice(0, MAX_UNTRACKED_FILES_LISTED)) {
    const details = await lstat(path.join(toplevel, relativePath)).catch(() => null)
    if (!details?.isFile()) {
      listed.push(`#   ${relativePath} (not a regular file)`)
      continue
    }
    let reason = null
    let content = null
    if (details.size > MAX_UNTRACKED_FILE_BYTES) {
      reason = 'too large'
    } else if (included.length >= MAX_UNTRACKED_FILES_WITH_CONTENT) {
      reason = 'file limit'
    } else {
      content = await readFile(path.join(toplevel, relativePath))
      if (content.subarray(0, 8000).includes(0)) {
        reason = 'binary'
      } else if (used + content.length > budget) {
        reason = 'patch size limit'
      }
    }
    if (reason || content === null || details.size === 0) {
      listed.push(`#   ${relativePath} (${details.size} bytes${reason ? `, ${reason}` : ''})`)
      continue
    }
    used += content.length
    listed.push(`#   ${relativePath} (${details.size} bytes, included)`)
    included.push(newFileDiff(relativePath, content))
  }
  if (files.length > MAX_UNTRACKED_FILES_LISTED) {
    listed.push(`#   ... and ${files.length - MAX_UNTRACKED_FILES_LISTED} more`)
  }
  return { listed, included }
}

function truncatedAtFileBoundary(diff, budget) {
  const text = diff.toString('utf8')
  if (Buffer.byteLength(text) <= budget) {
    return { text, truncated: false }
  }
  const cut = text.lastIndexOf('\ndiff --git ', budget)
  return { text: cut > 0 ? text.slice(0, cut + 1) : '', truncated: true }
}

async function repositoryToplevel(directory) {
  const text = gitText(directory, ['rev-parse', '--show-toplevel'])
  return text ? realpath(text).catch(() => null) : null
}

/** `third_party/x` for a repository inside the project, else its absolute path. */
function nestedRepositoryPath(toplevel, projectRoot) {
  const relative = path.relative(projectRoot, toplevel)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.split(path.sep).join('/')
    : toplevel
}

/** HEAD and dirty flag of the cwd's own repository, when it is not the project's. */
function nestedRepository(toplevel, projectRoot) {
  const status = runGit(toplevel, ['status', '--porcelain=v1', '--untracked-files=normal'])
  return {
    path: nestedRepositoryPath(toplevel, projectRoot),
    commit: gitText(toplevel, ['rev-parse', '--verify', '--quiet', 'HEAD']),
    dirty: status ? status.output.length > 0 : null
  }
}

function nestedHeaderLines(nested) {
  return nested.map(
    (repository) =>
      `# nested repository: ${repository.path} at ${repository.commit ?? 'no commit'}${
        repository.dirty ? ' with uncommitted changes (not in this patch)' : ''
      }`
  )
}

/**
 * Records the code a launch runs: the project repository's HEAD, dirty flag, and for a dirty tree
 * a patch of tracked changes plus small untracked text files. A cwd inside another repository
 * (a vendored `third_party/x` checkout or submodule) is listed in `code.nested`, never mistaken
 * for the project's code. Never writes to the user's repository.
 */
export async function captureLaunchCode(cwd, project, capturedAt) {
  const projectRoot = await realpath(project)
  const [toplevel, cwdToplevel] = await Promise.all([
    repositoryToplevel(projectRoot),
    repositoryToplevel(cwd)
  ])
  const nested =
    cwdToplevel && cwdToplevel !== toplevel ? [nestedRepository(cwdToplevel, projectRoot)] : []
  const empty = {
    code: {
      commit: null,
      dirty: null,
      capturedAt,
      capturePhase: 'at_launch',
      capturedBy: HARNESS_SOURCE,
      patch: null,
      patchSha256: null,
      nested
    },
    patch: null
  }
  if (!toplevel) {
    return empty
  }
  const commit = gitText(toplevel, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  const excluded = await recordPathsOutsideCode(projectRoot)
  const pathspecs = codePathspecs(toplevel, projectRoot, excluded)
  const status = runGit(toplevel, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...pathspecs
  ])
  if (!status) {
    return { ...empty, code: { ...empty.code, commit } }
  }
  const dirty = status.output.length > 0
  const code = { ...empty.code, commit, dirty }
  if (!dirty) {
    return { code, patch: null }
  }
  const tracked = runGit(toplevel, [
    'diff',
    ...(commit ? ['HEAD'] : ['--cached']),
    '--no-color',
    '--no-ext-diff',
    '--',
    ...pathspecs
  ])
  const untrackedList = runGit(toplevel, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...pathspecs
  ])
  const untrackedFiles = (untrackedList?.output.toString('utf8') ?? '').split('\0').filter(Boolean)
  const trackedDiff = truncatedAtFileBoundary(tracked?.output ?? Buffer.alloc(0), MAX_PATCH_BYTES)
  const trackedText = trackedDiff.text
  const trackedTruncated = Boolean(tracked?.truncated) || trackedDiff.truncated
  const untracked = await untrackedSection(
    toplevel,
    untrackedFiles,
    MAX_PATCH_BYTES - Buffer.byteLength(trackedText)
  )
  const header = [
    '# Aster launch code capture (git apply ignores these comment lines)',
    `# commit: ${commit ?? 'none (no commits yet)'}`,
    `# captured-at: ${capturedAt}`,
    `# excluded: ${excluded.map((item) => (item.directory ? `${item.path}/` : item.path)).join(', ')}`,
    ...(trackedTruncated ? ['# tracked diff truncated at the 5 MiB patch limit'] : []),
    ...nestedHeaderLines(nested),
    `# untracked files: ${untrackedFiles.length}`,
    ...untracked.listed,
    ''
  ].join('\n')
  const patch = Buffer.from(`${header}${trackedText}${untracked.included.join('')}`, 'utf8')
  return {
    code: {
      ...code,
      patch: CODE_PATCH_FILE,
      patchSha256: sha256OfBuffer(patch),
      ...(trackedTruncated ? { patchTruncated: true } : {})
    },
    patch
  }
}

async function isDirectory(target) {
  return lstat(target).then(
    (details) => details.isDirectory(),
    () => false
  )
}

const MAX_MAPPED_SEGMENTS = 6

/**
 * Answers where a recorded commit came from, for Runs captured before `code.nested` existed: their
 * `code.commit` is the HEAD of whatever repository held the cwd. Results are cached per lookup.
 */
export function createCodeOriginLookup(project) {
  let roots = null
  const commits = new Map()
  const nested = new Map()
  const projectRoots = async () => {
    if (!roots) {
      const projectRoot = await realpath(project)
      roots = { projectRoot, toplevel: await repositoryToplevel(projectRoot) }
    }
    return roots
  }
  const nestedFor = async (cwd) => {
    const { projectRoot, toplevel } = await projectRoots()
    const here = await realpath(cwd).catch(() => null)
    if (here) {
      const cwdToplevel = await repositoryToplevel(here)
      return cwdToplevel && cwdToplevel !== toplevel
        ? nestedRepositoryPath(cwdToplevel, projectRoot)
        : null
    }
    // Why map the tail: a Run recorded on another machine names a cwd that does not exist here,
    // but `<project>/third_party/x` usually does.
    const segments = cwd.split(/[\\/]+/u).filter(Boolean)
    for (let count = 1; count < Math.min(segments.length, MAX_MAPPED_SEGMENTS + 1); count += 1) {
      const candidate = path.join(projectRoot, ...segments.slice(-count))
      if (!(await isDirectory(candidate))) {
        continue
      }
      const candidateToplevel = await repositoryToplevel(candidate)
      if (candidateToplevel && candidateToplevel !== toplevel) {
        return nestedRepositoryPath(candidateToplevel, projectRoot)
      }
    }
    return null
  }
  return {
    /** True or false once the project is a git repository; null when it is not. */
    async commitInProject(commit) {
      const { toplevel } = await projectRoots()
      if (!toplevel || typeof commit !== 'string' || !/^[0-9a-f]{7,64}$/iu.test(commit)) {
        return null
      }
      if (!commits.has(commit)) {
        commits.set(commit, runGit(toplevel, ['cat-file', '-e', `${commit}^{commit}`]) !== null)
      }
      return commits.get(commit)
    },
    /** The repository other than the project's that holds `cwd`, as `third_party/x`, or null. */
    async nestedRepositoryFor(cwd) {
      if (typeof cwd !== 'string' || !cwd) {
        return null
      }
      if (!nested.has(cwd)) {
        nested.set(cwd, await nestedFor(cwd).catch(() => null))
      }
      return nested.get(cwd)
    }
  }
}
