// `figures plot …`: data figures drawn by a Python script with aster_plot.py.
import { HarnessError } from './research-harness-error.mjs'
import { PLOT_API_INDEX } from './research-figures-plot-api.mjs'
import { resolveKitQuery } from './research-figures-kit-resolve.mjs'
import { plotStyleData } from './research-figures-plot-style.mjs'
import {
  PLOT_KINDS,
  checkPlot,
  createPlot,
  previewPlot,
  runPlot
} from './research-figures-plot.mjs'

const ACTIONS = ['new', 'run', 'check', 'preview', 'style', 'kit']

function kindsText() {
  return Object.entries(PLOT_KINDS)
    .map(([kind, starter]) => `  ${kind.padEnd(14)} ${starter.label}`)
    .join('\n')
}

/** Where to start for the figures agents asked for most, before the full list. */
const PLOT_TASKS = `Find by task (\`figures plot kit <name>\` prints one helper; option values such as sharp-flat or sophia find theirs):
  optimiser paths on a toy loss: f = ap.toy.fn(name) (rosenbrock, beale, himmelblau, booth, rastrigin, quadratic, saddle, sharp-flat = Sophia's sharp and flat directions, two-basins; or fn(f=, grad=, hess=)), then ap.toy.optimize(f, start, method, lr, steps) per method: gd, momentum, nesterov, rmsprop, adam, sign (SignGD), signum, lion, newton (full Hessian, drawn to saddles), diag-newton (per-coordinate Newton), sophia (clipped diagonal Newton). Adam without its averages is method="adam", betas=(0, 0): the same path as sign. Draw them on ap.surface (3D; ap.view3d picks the view) or ap.landscape (contours); several methods take ap.series(n, ours=i, hues=True), one hue each.
  generation toys: ap.toy.ring | moons | checkerboard | swiss_roll | mix, then ap.toy.flow (ODE, SDE or straight paths), ap.toy.sample (diffusion samplers), ap.toy.couple (OT or random pairs), ap.toy.pair_flow.
  results from Runs: ap.load_runs, ap.read_metrics, then curves, bars, heat_table, radar, significance.
  a plot inside a diagram: ap.figure(size=(w / 144, h / 144), panel=True); fig.plot({ figure, w, h }) renders it at that cell.
`

/** aster_plot's functions and the starter kinds: `figures plot kit`, also `figures kit data`. */
export function plotKitText() {
  return `${PLOT_TASKS}\n${PLOT_API_INDEX}\nKinds (figures plot new --kind):\n${kindsText()}`
}

function plotKitQuery(query) {
  try {
    return resolveKitQuery(query, { plot: true })
  } catch (error) {
    throw new HarnessError('invalid_argument', error.message)
  }
}

/** `figures plot style`: a preset's colours as plots take them, or the whole JSON. */
function styleResult({ style, accent, json }) {
  const data = plotStyleData()
  if (json) {
    return { action: 'style', data }
  }
  const id = data.aliases[style] ?? style ?? data.defaultPreset
  const preset = data.presets[id]
  if (!preset) {
    throw new HarnessError(
      'invalid_argument',
      `Unknown style ${style}; styles: ${Object.keys(data.presets).join(', ')}`
    )
  }
  const named = accent ? (preset.withAccent[data.accentAliases[accent] ?? accent] ?? null) : null
  if (accent && !named && !/^#[0-9a-f]{6}$/i.test(accent)) {
    throw new HarnessError(
      'invalid_argument',
      `Unknown accent ${accent}; accents: ${Object.keys(data.swatches).join(', ')} or #rrggbb`
    )
  }
  return {
    action: 'style',
    style: id,
    accent: accent ?? preset.accentName,
    ours: named ?? preset.accents[0],
    neutrals: {
      ink: preset.ink,
      line: preset.line,
      muted: preset.muted,
      block: preset.block,
      strong: preset.strong,
      mid: preset.mid
    },
    semantic: data.semantic,
    fonts: data.fonts
  }
}

export const commands = {
  'figures plot': {
    spec: {
      // Why two: `figures plot kit radar,bars` names helpers after the action.
      positionals: 2,
      values: [
        '--name',
        '--slug',
        '--kind',
        '--size',
        '--venue',
        '--style',
        '--accent',
        '--figure',
        '--python'
      ]
    },
    run: async ({ project, positionals, options }) => {
      const [action, extra] = positionals
      if (extra && action !== 'kit') {
        throw new HarnessError('usage', `figures plot ${action} takes no name after it`)
      }
      const figure = options['--figure']
      const python = options['--python']
      switch (action) {
        case 'new':
          if (!options['--name']) {
            throw new HarnessError('usage', 'figures plot new needs --name NAME')
          }
          return {
            action,
            ...(await createPlot(project, {
              name: options['--name'],
              slug: options['--slug'],
              kind: options['--kind'] ?? 'blank',
              size: options['--size'],
              venue: options['--venue'],
              style: options['--style'],
              accent: options['--accent']
            }))
          }
        case 'run':
          return { action, ...(await runPlot(project, figure, { python })) }
        case 'check':
          return { action, ...(await checkPlot(project, figure, { python })) }
        case 'preview':
          return { action, ...(await previewPlot(project, figure, { python })) }
        case 'style':
          return styleResult({
            style: options['--style'],
            accent: options['--accent'],
            json: Boolean(options['--json'])
          })
        case 'kit':
          return { action, text: extra ? plotKitQuery(extra) : plotKitText() }
        default:
          throw new HarnessError(
            'usage',
            `figures plot takes ${ACTIONS.join(', ')}${action ? `, not ${action}` : ''}`
          )
      }
    },
    failed: (result) =>
      (result.action === 'run' && !result.saved) ||
      (result.action === 'check' && result.figures.some((figure) => figure.errors.length > 0))
  }
}

function findingLines(level, findings) {
  return findings.map(
    (finding) =>
      `  ${level} ${finding.code}${finding.id ? ` ${finding.id}` : ''}: ${finding.message}`
  )
}

function runText(result) {
  return [
    `${result.script} exited ${result.exitCode} (${result.python}; aster_plot.py at ${result.lib})`,
    result.stdout.trimEnd(),
    result.stderr.trimEnd(),
    result.diagrams?.length
      ? `Updated the plot in ${result.diagrams.join(', ')} (diagrams that embed it).`
      : null,
    result.problem ? `PROBLEM ${result.problem}` : null
  ]
    .filter(Boolean)
    .join('\n')
}

function checkText(result) {
  if (!result.figures.length) {
    return 'No plots to check.'
  }
  return result.figures
    .map((figure) =>
      figure.errors.length || figure.warnings.length || figure.notes.length
        ? [
            `${figure.scene}: ${figure.errors.length} errors, ${figure.warnings.length} warnings, ${figure.notes.length} notes${figure.ran ? ' (ran it first)' : ''}`,
            ...findingLines('ERROR', figure.errors),
            ...findingLines('warning', figure.warnings),
            ...findingLines('note', figure.notes)
          ].join('\n')
        : `${figure.scene}: ok`
    )
    .join('\n')
}

function previewText(result) {
  return [
    `${result.png}\n(${result.size.widthIn} × ${result.size.heightIn} in, rendered ${result.renderedAt}${result.ran ? ' just now' : ''}; open it and look)`,
    result.print
      ? `${result.print}\n(the plot at print size, 150 dpi: every label must be easy to read)`
      : null,
    result.lint
      ? `${result.lint}\n(${result.findings} findings boxed in red, solid for errors, dashed for warnings; figures plot check gives the messages)`
      : null,
    `${result.pdf} is what the paper gets (figures publish --figure ${result.figure}, only when the person asks)`
  ]
    .filter(Boolean)
    .join('\n')
}

function styleText(result) {
  if (result.data) {
    return JSON.stringify(result.data, null, 2)
  }
  const ours = result.ours
  return [
    `${result.style}, accent ${result.accent ?? 'none'} (ap.use(${JSON.stringify(result.style)}${result.accent ? `, accent=${JSON.stringify(result.accent)}` : ''}))`,
    `  ours      solid ${ours.solid}  fill ${ours.fill}  strong ${ours.strong}  ink ${ours.ink}`,
    `  neutrals  ink ${result.neutrals.ink}  line ${result.neutrals.line}  muted ${result.neutrals.muted}  mid ${result.neutrals.mid}  strong ${result.neutrals.strong}  block ${result.neutrals.block}`,
    `  good      ${result.semantic.good.solid}  bad ${result.semantic.bad.solid}`,
    `  text      ${result.fonts.label} pt labels, ${result.fonts.small} pt ticks, legends and notes, nothing under ${result.fonts.min} pt`
  ].join('\n')
}

export const textOutput = {
  'figures plot': (result) => {
    switch (result.action) {
      case 'new':
        return `Created ${result.script} from the ${result.kind} starter (a finished demo on toy data) with ${result.lib} beside it. Swap in the project's data, then figures plot run --figure ${result.slug}: it writes ${result.pdf}, .svg, .png and ${result.manifest}.`
      case 'run':
        return runText(result)
      case 'check':
        return checkText(result)
      case 'preview':
        return previewText(result)
      case 'style':
        return styleText(result)
      default:
        return result.text
    }
  }
}

export const usage = `
Plots (data figures) are Python scripts, <figures>/src/<slug>.plot.py, that import aster_plot.py
beside them (numpy + matplotlib; written by figures plot new and run) and end with p.save(): it
writes <slug>.pdf (vector, page-true), .svg, .embed.svg, a .png preview and <slug>.plot.json with
what the checks found. They share the diagrams' styles and appear on the Figures page.
  figures plot new --name NAME [--slug SLUG] [--kind KIND] [--size single|onehalf|double|WxH[in|pt|cm|mm|u]]
                   [--venue icml|cvpr|acl|neurips|arxiv] [--style PRESET] [--accent NAME|#hex]
                                         Starts the script from a finished demo of that kind
                                         (figures plot kit lists the kinds)
  figures plot run [--figure SLUG] [--python PATH]
                                         Runs it with a Python that has numpy and matplotlib
                                         ($ASTER_PLOT_PYTHON, python3, python, conda envs)
  figures plot check [--figure SLUG]     The checks at print size (runs the script when it
                                         changed); exit 1 on errors
  figures plot preview [--figure SLUG]   The PNG, the print-size PNG and the findings boxed in
                                         red; open them and look
  figures plot kit [NAME[,NAME]]         aster_plot's functions, options and the kinds; or only
                                         the named helpers, sections (results, 3d) or kinds
  figures plot style [--style PRESET] [--accent NAME|#hex] [--json]
                                         The colours plots take (the diagrams' presets)
`
