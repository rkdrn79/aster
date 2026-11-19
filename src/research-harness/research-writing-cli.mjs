import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { listWritingBibliography } from './research-writing-bib.mjs'
import { checkWriting } from './research-writing-check.mjs'
import { writingCodeContext } from './research-writing-context.mjs'
import { outlineWriting } from './research-writing-outline.mjs'
import {
  confirmWritingSkeleton,
  readWritingSkeleton,
  setWritingSkeleton
} from './research-writing-skeleton.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function inputText(file) {
  if (!file) {
    throw new HarnessError(
      'usage',
      'writing skeleton set needs --file PATH (or --file - for stdin)'
    )
  }
  return file === '-' ? readStdin() : readFile(path.resolve(file), 'utf8')
}

function inAgentSession() {
  const identity = agentIdentityFromEnvironment()
  return Boolean(identity?.provider || identity?.sessionId)
}

async function skeletonCommand({ project, options, positionals }) {
  const [action] = positionals
  const section = options['--section']
  if (action === 'get') {
    return { action, skeleton: await readWritingSkeleton(project, section) }
  }
  if (action === 'set') {
    const text = await inputText(options['--file'])
    return {
      action,
      skeleton: await setWritingSkeleton(project, section, {
        text,
        by: inAgentSession() ? 'agent' : 'user'
      })
    }
  }
  if (action === 'confirm') {
    // Why: confirming is the person's decision, as approving a proposal is.
    if (inAgentSession()) {
      throw new HarnessError(
        'forbidden',
        'writing skeleton confirm is refused inside an agent session; the person confirms the skeleton on the Writing page in Aster'
      )
    }
    return { action, skeleton: await confirmWritingSkeleton(project, section, { by: 'user' }) }
  }
  throw new HarnessError('usage', 'writing skeleton takes get, set or confirm')
}

export const commands = {
  'writing check': {
    spec: { values: ['--file', '--section'] },
    run: ({ project, options }) =>
      checkWriting(project, {
        file: options['--file'] ?? null,
        section: options['--section'] ?? null
      }),
    failed: (result) => result.summary.errors > 0
  },
  'writing outline': {
    spec: { values: ['--file', '--section'] },
    run: ({ project, options }) =>
      outlineWriting(project, {
        file: options['--file'] ?? null,
        section: options['--section'] ?? null
      })
  },
  'writing skeleton': {
    spec: { values: ['--section', '--file'], positionals: 1, required: ['--section'] },
    run: skeletonCommand
  },
  'writing context': {
    spec: { repeatable: ['--code'] },
    run: ({ project, options }) => writingCodeContext(project, { code: options['--code'] ?? [] })
  },
  'writing bib': {
    spec: { values: ['--file'] },
    run: ({ project, options }) =>
      listWritingBibliography(project, { file: options['--file'] ?? null })
  }
}

function findingLine(level, finding) {
  const span = finding.span ? ` "${finding.span}"` : ''
  const fix = finding.fix ? ` Fix: ${finding.fix}` : ''
  return `  ${level} ${finding.code} ${finding.file}:${finding.line}${span}: ${finding.message}${fix}`
}

function checkText(result) {
  const { summary } = result
  const lines = [
    `${result.manuscript}${result.fragment ? ' (one section file)' : ''} · ${summary.errors} errors, ${summary.warnings} warnings, ${summary.notes} notes`
  ]
  for (const section of result.sections) {
    const profile = section.profile
    lines.push(
      `${section.title || '(untitled)'} (${section.role}, ${section.file}:${section.line}–${section.endLine}) · score ${section.score} · ${profile.words} words, ${profile.citesPer100Words} cites/100w, ${profile.refsPer1kWords} refs/1kw, ${profile.hedgesPer1kWords} hedges/1kw, passive ${Math.round(profile.passiveShare * 100)}%, "we" ${profile.wePer1kWords}/1kw`,
      ...section.errors.map((finding) => findingLine('ERROR', finding)),
      ...section.warnings.map((finding) => findingLine('warning', finding)),
      ...section.notes.map((finding) => findingLine('note', finding))
    )
  }
  lines.push(
    result.bibliography.files.length
      ? `Bibliography: ${result.bibliography.files.join(', ')} (${result.bibliography.keys} keys) · claims ledger: ${result.claims.ledger ? `${result.claims.claims} claims` : 'none yet'}`
      : `No bibliography found · claims ledger: ${result.claims.ledger ? `${result.claims.claims} claims` : 'none yet'}`
  )
  return lines.join('\n')
}

function outlineText(result) {
  const lines = [`${result.manuscript}${result.fragment ? ' (one section file)' : ''}`]
  for (const section of result.sections) {
    lines.push(
      `${section.title || '(untitled)'} (${section.role}, ${section.file}:${section.line}) · ${section.words} words${section.published ? ` · published ${section.published}` : ''}`
    )
    for (const paragraph of section.paragraphs) {
      const signals = [
        `${paragraph.words} w`,
        paragraph.cites ? `${paragraph.cites} cites` : 'no cites',
        paragraph.refs.length ? `refs ${paragraph.refs.join(', ')}` : null,
        paragraph.numbers ? `${paragraph.numbers} numbers` : null,
        paragraph.hedges ? `${paragraph.hedges} hedges` : null
      ].filter(Boolean)
      lines.push(
        `  ¶${paragraph.index + 1} ${paragraph.file}:${paragraph.line} ${paragraph.role} · ${signals.join(' · ')}`
      )
      lines.push(`     first: ${paragraph.topic}`)
      if (paragraph.last) {
        lines.push(`     last:  ${paragraph.last}`)
      }
    }
  }
  lines.push(
    'Roles are cue-word guesses; check that each paragraph has one job and that its first sentence states it.'
  )
  return lines.join('\n')
}

function skeletonText(result) {
  const skeleton = result.skeleton
  const status = {
    missing: 'not written yet',
    draft: 'draft: waiting for the person to confirm it on the Writing page',
    confirmed: `confirmed${skeleton.confirmedAt ? ` ${skeleton.confirmedAt}` : ''}`
  }[skeleton.status]
  const lines = [`${skeleton.path} · ${skeleton.section} · ${status}`]
  for (const line of skeleton.lines) {
    lines.push(`${line.key}: ${line.text || '(empty)'}`)
  }
  if (skeleton.notes) {
    lines.push('', skeleton.notes)
  }
  if (result.action === 'set') {
    lines.push(
      '',
      skeleton.missing.length
        ? `Still empty: ${skeleton.missing.join(', ')}.`
        : 'All five lines are filled in.',
      'Show it to the person and stop: they confirm it on the Writing page in Aster (or answer in the chat). Draft only after that.'
    )
  }
  if (result.action === 'confirm') {
    lines.push('', 'Confirmed. Draft the section from these lines.')
  }
  return lines.join('\n')
}

function contextText(result) {
  const lines = [`${result.files.length} files, ${result.lines} lines`]
  lines.push(
    'Core candidates (the operations a method section is about; order the method by idea, not by these files):'
  )
  for (const symbol of result.candidates) {
    lines.push(
      `  ${symbol.file}:${symbol.line} ${symbol.name} (${symbol.kind}, ${symbol.lines} lines): ${symbol.why}`
    )
  }
  for (const module of result.modules) {
    lines.push(`${module.file} (${module.lines} lines)`)
    for (const symbol of module.symbols) {
      lines.push(`  ${symbol.line} ${symbol.name} · ${symbol.role}`)
    }
  }
  if (result.omit.length) {
    lines.push('Engineering detail to leave out of the prose (appendix or nothing):')
    lines.push(
      ...result.omit.slice(0, 40).map((entry) => `  ${entry.file}:${entry.line} ${entry.name}`)
    )
  }
  if (result.flags.length) {
    lines.push(
      'Flags and defaults (never in the prose; the values that matter go to the appendix with the ablation that supports them):'
    )
    lines.push(...result.flags.slice(0, 60).map((entry) => `  ${entry.flag} (${entry.file})`))
  }
  lines.push(
    'These classes are guesses from names and tensor operations. Write the code manifest (symbol, what it does, class, main text / appendix / omit, paper name), and ask the person which parts are theirs and which are borrowed.'
  )
  return lines.join('\n')
}

function bibText(result) {
  const lines = result.files.length
    ? [`${result.files.join(', ')} · ${result.entries.length} keys`]
    : [
        'No .bib or .bbl found: cite nothing until the person adds one; use \\cite{TODO:what-it-must-show}.'
      ]
  if (result.missing.length) {
    lines.push(`Declared but missing: ${result.missing.join(', ')}`)
  }
  for (const entry of result.entries) {
    lines.push(
      `${entry.key}  ${entry.title || '(no title)'}${entry.year ? ` (${entry.year})` : ''}`
    )
  }
  return lines.join('\n')
}

export const textOutput = {
  'writing check': checkText,
  'writing outline': outlineText,
  'writing skeleton': skeletonText,
  'writing context': contextText,
  'writing bib': bibText
}

export const usage = `
Writing (the Writing page's agent). --file defaults to the catalog's manuscript; a file the
manuscript includes is read inside it, a lone section file is read alone. --section picks
abstract|intro|related|background|method|experiments|conclusion.
  writing check [--file TEX] [--section S]
                                         Mechanical writing lint: citations per section and
                                         paragraph, figure/table references, undefined notation,
                                         code identifiers and engineering detail in prose, "we"
                                         and passive voice, restating paragraph endings, hedges,
                                         numbers without claims, cite keys missing from the .bib,
                                         unscoped superlatives, sentence rhythm. Exit 1 on errors.
                                         Waive one finding with % writing-check: allow CODE <reason>
  writing outline [--file TEX] [--section S]
                                         Paragraph map: guessed role, first and last sentence,
                                         citations, references, numbers and hedges per paragraph
  writing skeleton get|set|confirm --section intro|method|experiments|abstract|related [--file PATH|-]
                                         The 5-line logic skeleton (GAP, WHY-NOT, INSIGHT,
                                         APPROACH, EVIDENCE; optional BUDGET, CONTEXT, LOSES, TERM, VARIANT,
                                         CONTRIBUTIONS, ORDER, OMIT, QUESTIONS) in
                                         <record root>/writing/<section>.skeleton.md. set reads
                                         KEY: text lines and notes; any change makes it a draft.
                                         confirm is the person's: refused in agent sessions
  writing context --code PATH [--code PATH]...
                                         Modules and functions of the code, core candidates,
                                         engineering detail and flags to keep out of the prose
  writing bib [--file TEX]               Every citation key the manuscript may use, with titles
`
