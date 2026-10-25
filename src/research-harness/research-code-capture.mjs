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

/**
 * Records the code a launch runs: HEAD, dirty flag, and for a dirty tree a patch of tracked
 * changes plus small untracked text files. Never writes to the user's repository.
 */
export async function captureLaunchCode(cwd, project, capturedAt) {
  const empty = {
    code: {
      commit: null,
      dirty: null,
      capturedAt,
      capturePhase: 'at_launch',
      capturedBy: HARNESS_SOURCE,
      patch: null,
      patchSha256: null
    },
    patch: null
  }
  const toplevelText = gitText(cwd, ['rev-parse', '--show-toplevel'])
  if (!toplevelText) {
    return empty
  }
  const toplevel = await realpath(toplevelText)
  const commit = gitText(toplevel, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  const projectRoot = await realpath(project)
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
