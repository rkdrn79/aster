import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'

/**
 * `writing context --code`: what a method section is written from. It lists the code's modules
 * and functions, sorts each into a core candidate, engineering detail or configuration, and
 * collects the flags and defaults that must stay out of the prose. The classes are cue-word
 * guesses: the Writing agent confirms them and asks the person what code cannot show.
 */

const CODE_EXTENSIONS = new Set([
  '.py',
  '.js',
  '.mjs',
  '.ts',
  '.jl',
  '.cpp',
  '.cc',
  '.cu',
  '.c',
  '.h',
  '.hpp',
  '.rs',
  '.go',
  '.java',
  '.scala',
  '.lua',
  '.m',
  '.r',
  '.swift'
])
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'build',
  'dist',
  'wandb',
  'outputs',
  'output',
  'checkpoints',
  'logs',
  'data',
  'datasets',
  'paper',
  'figures',
  '.aster',
  'research',
  '.ipynb_checkpoints',
  'site-packages'
])
const PREFERRED = /^(?:src|code|lib|model|models|method|methods|core|algorithms?|modules?)$/i
const MAX_FILES = 200
const MAX_FILE_BYTES = 512 * 1024

const ENGINEERING =
  /log|logger|print|save|load|checkpoint|ckpt|parse_?args|argparse|config|setup|distributed|ddp|dist_|device|to_device|cuda|seed|wandb|tensorboard|profil|benchmark|timer|download|cache_dir|collate|dataloader|worker|pad|visuali[sz]|plot|debug|test_|_test|main$|^main|cli|hparam|registry|register|wrapper|utils?$|helper/i
const CORE_NAME =
  /loss|objective|forward|attention|attn|score|prune|update|step|sample|reward|policy|encode|decode|quantiz|merge|kernel|mask|predict|denois|diffus|norm|gate|router|smooth|scale|project|embed|evict|cache/i
const CORE_BODY =
  /\b(?:matmul|einsum|softmax|log_softmax|logsigmoid|sigmoid|topk|argsort|cumsum|norm|exp|log|mean|sum|grad|backward|lerp|clamp|sqrt|tanh|bmm|@)\b/g

async function isDirectory(target) {
  return lstat(target).then(
    (details) => details.isDirectory(),
    () => false
  )
}

async function codeFilesUnder(root, limit = MAX_FILES) {
  const files = []
  async function walk(directory, depth) {
    if (files.length >= limit || depth > 6) {
      return
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        continue
      }
      const target = path.join(directory, entry.name)
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
        await walk(target, depth + 1)
      } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(target)
      }
      if (files.length >= limit) {
        return
      }
    }
  }
  await walk(root, 0)
  return files
}

async function lineCount(file) {
  const text = await readFile(file, 'utf8').catch(() => '')
  return text ? text.split('\n').length : 0
}

/** Folders that hold code, most likely method code first, for the app's folder picker. */
export async function listCodeFolders(projectPath) {
  const project = await realpath(projectPath)
  const recordRoot = projectLayout(project).root
  const folders = []
  const rootFiles = (await readdir(project, { withFileTypes: true }).catch(() => [])).filter(
    (entry) => entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))
  )
  if (rootFiles.length) {
    let lines = 0
    for (const entry of rootFiles) {
      lines += await lineCount(path.join(project, entry.name))
    }
    folders.push({ path: '.', files: rootFiles.length, lines })
  }
  const top = (await readdir(project, { withFileTypes: true }).catch(() => [])).filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !SKIPPED_DIRECTORIES.has(entry.name) &&
      entry.name !== recordRoot
  )
  for (const entry of top) {
    const files = await codeFilesUnder(path.join(project, entry.name), 400)
    if (!files.length) {
      continue
    }
    let lines = 0
    for (const file of files.slice(0, 100)) {
      lines += await lineCount(file)
    }
    folders.push({ path: entry.name, files: files.length, lines })
  }
  folders.sort(
    (a, b) => Number(PREFERRED.test(b.path)) - Number(PREFERRED.test(a.path)) || b.lines - a.lines
  )
  return { folders: folders.slice(0, 30) }
}

function pythonSymbols(text) {
  const lines = text.split('\n')
  const symbols = []
  let currentClass = null
  lines.forEach((line, index) => {
    const classMatch = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/.exec(line)
    if (classMatch) {
      currentClass = classMatch[1]
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        line: index + 1,
        bases: classMatch[2] ?? ''
      })
      return
    }
    const defMatch = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/.exec(line)
    if (defMatch) {
      const nested = defMatch[1].length > 0
      if (!nested) {
        currentClass = null
      }
      symbols.push({
        name: nested && currentClass ? `${currentClass}.${defMatch[2]}` : defMatch[2],
        kind: nested ? 'method' : 'function',
        line: index + 1
      })
    }
  })
  return symbols
}

function genericSymbols(text) {
  const symbols = []
  text.split('\n').forEach((line, index) => {
    const match =
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(line) ??
      /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/.exec(line) ??
      /^\s*(?:export\s+)?class\s+(\w+)/.exec(line) ??
      /^\s*(?:__global__\s+)?(?:static\s+)?(?:inline\s+)?(?:void|float|double|int|auto|torch::Tensor|at::Tensor)\s+(\w+)\s*\(/.exec(
        line
      ) ??
      /^\s*fn\s+(\w+)/.exec(line)
    if (match) {
      symbols.push({
        name: match[1],
        kind: /class/.test(line) ? 'class' : 'function',
        line: index + 1
      })
    }
  })
  return symbols
}

function classify(symbol, body) {
  const operations = body.match(CORE_BODY)?.length ?? 0
  const short = symbol.name.split('.').at(-1)
  if (/^_*(?:init|__init__|repr|str)_*$/.test(short) || ENGINEERING.test(short)) {
    return { role: 'engineering', why: 'I/O, logging, setup, devices, padding or plumbing' }
  }
  if (symbol.kind === 'class' && /nn\.Module|Module\b/.test(symbol.bases ?? '')) {
    return { role: 'core', why: 'a model module; describe what it computes, not its constructor' }
  }
  if (CORE_NAME.test(short) || operations >= 4) {
    return {
      role: 'core',
      why:
        operations >= 4
          ? `${operations} tensor operations`
          : 'its name names an operation of the method'
    }
  }
  return {
    role: 'support',
    why: 'plumbing between the core steps; mention only if a claim depends on it'
  }
}

function flagsIn(text) {
  const flags = new Set()
  for (const match of text.matchAll(
    /add_argument\(\s*['"](--[\w-]+)['"](?:[^)]*?default\s*=\s*([^,)\n]+))?/g
  )) {
    flags.add(match[2] ? `${match[1]} (default ${match[2].trim()})` : match[1])
  }
  for (const match of text.matchAll(/flags\.DEFINE_\w+\(\s*['"](\w+)['"]\s*,\s*([^,]+)/g)) {
    flags.add(`--${match[1]} (default ${match[2].trim()})`)
  }
  for (const match of text.matchAll(/^\s*(\w+)\s*:\s*(?:int|float|bool|str)\s*=\s*([^#\n]+)/gm)) {
    flags.add(`${match[1]} = ${match[2].trim()}`)
  }
  return [...flags]
}

async function resolveCodePath(project, entry) {
  const absolute = path.resolve(project, entry)
  const relative = path.relative(project, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HarnessError('invalid_argument', `--code must stay inside the project: ${entry}`)
  }
  const real = await realpath(absolute).catch(() => null)
  if (!real) {
    throw new HarnessError('not_found', `No such code path: ${entry}`)
  }
  return real
}

export async function writingCodeContext(projectPath, { code = [] } = {}) {
  const project = await realpath(projectPath)
  if (!code.length) {
    throw new HarnessError('usage', 'writing context needs at least one --code PATH')
  }
  const files = []
  for (const entry of code) {
    const target = await resolveCodePath(project, entry)
    files.push(...((await isDirectory(target)) ? await codeFilesUnder(target) : [target]))
  }
  const modules = []
  const flags = []
  for (const file of [...new Set(files)].slice(0, MAX_FILES)) {
    const text = await readFile(file, 'utf8').catch(() => '')
    if (!text || text.length > MAX_FILE_BYTES) {
      continue
    }
    const lines = text.split('\n')
    const found = file.endsWith('.py') ? pythonSymbols(text) : genericSymbols(text)
    const symbols = found.map((symbol, index) => {
      const end = (found[index + 1]?.line ?? lines.length + 1) - 1
      const body = lines.slice(symbol.line - 1, end).join('\n')
      return {
        name: symbol.name,
        kind: symbol.kind,
        line: symbol.line,
        lines: end - symbol.line + 1,
        ...classify(symbol, body)
      }
    })
    const relative = path.relative(project, file).split(path.sep).join('/')
    modules.push({ file: relative, lines: lines.length, symbols })
    flags.push(...flagsIn(text).map((flag) => ({ flag, file: relative })))
  }
  const core = modules.flatMap((module) =>
    module.symbols
      .filter((symbol) => symbol.role === 'core')
      .map((symbol) => ({ ...symbol, file: module.file }))
  )
  return {
    files: modules.map((module) => module.file),
    lines: modules.reduce((sum, module) => sum + module.lines, 0),
    modules,
    candidates: core.sort((a, b) => b.lines - a.lines).slice(0, 12),
    omit: modules.flatMap((module) =>
      module.symbols
        .filter((symbol) => symbol.role === 'engineering')
        .map((symbol) => ({
          name: symbol.name,
          file: module.file,
          line: symbol.line,
          why: symbol.why
        }))
    ),
    flags
  }
}
