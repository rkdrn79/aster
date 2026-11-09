// The icons a figure may use: Lucide (ISC) line icons by default and Noto Emoji (Apache-2.0) as an
// opt-in colour variant, vendored under vendor/icons. Badges (flame trained, snowflake frozen)
// and sparing marks for actors, modalities and tools; never decoration.

/** name → [emoji codepoints (Noto file), Lucide icon, what it stands for]. */
export const FIGURE_ICONS = {
  fire: ['1f525', 'flame', 'trained, updated weights'],
  snowflake: ['2744', 'snowflake', 'frozen weights'],
  lock: ['1f512', 'lock', 'fixed, private'],
  unlock: ['1f513', 'lock-open', 'unlocked, tunable'],
  robot: ['1f916', 'bot', 'an agent, a model acting'],
  person: ['1f464', 'user', 'a user, a human'],
  coder: ['1f9d1_200d_1f4bb', 'laptop', 'a developer, an annotator'],
  brain: ['1f9e0', 'brain', 'a model, reasoning'],
  chat: ['1f4ac', 'message-square', 'a prompt, a message'],
  document: ['1f4c4', 'file-text', 'a document, text data'],
  image: ['1f5bc', 'image', 'images'],
  video: ['1f3a5', 'video', 'video'],
  audio: ['1f50a', 'volume-2', 'audio, speech'],
  'bar-chart': ['1f4ca', 'chart-column', 'results, a benchmark'],
  'line-chart': ['1f4c8', 'chart-line', 'a curve, training progress'],
  search: ['1f50d', 'search', 'retrieval, search'],
  database: ['1f5c4', 'database', 'a database, a corpus'],
  globe: ['1f310', 'globe', 'the web'],
  gear: ['2699', 'settings', 'a process, configuration'],
  tools: ['1f6e0', 'wrench', 'tools an agent calls'],
  check: ['2705', 'check', 'correct, accepted'],
  cross: ['274c', 'x', 'wrong, rejected'],
  'thumbs-up': ['1f44d', 'thumbs-up', 'chosen, preferred'],
  'thumbs-down': ['1f44e', 'thumbs-down', 'rejected, dispreferred'],
  trophy: ['1f3c6', 'trophy', 'the best, a winner'],
  target: ['1f3af', 'target', 'a goal, a target'],
  timer: ['23f1', 'timer', 'time, latency'],
  lightning: ['26a1', 'zap', 'fast, efficient'],
  dice: ['1f3b2', 'dices', 'sampling, randomness'],
  bulb: ['1f4a1', 'lightbulb', 'an idea, an insight'],
  puzzle: ['1f9e9', 'puzzle', 'a module, a plug-in'],
  repeat: ['1f501', 'repeat', 'a loop, iterations'],
  scissors: ['2702', 'scissors', 'pruning, cutting'],
  package: ['1f4e6', 'package', 'a package, a release'],
  folders: ['1f5c2', 'folder-open', 'files, a dataset'],
  computer: ['1f5a5', 'monitor', 'a computer, an environment'],
  camera: ['1f4f7', 'camera', 'a camera, an observation'],
  'robot-arm': ['1f9be', 'hand-metal', 'a robot, manipulation'],
  earth: ['1f30d', 'earth', 'the world, an environment'],
  books: ['1f4da', 'library-big', 'a corpus, a library'],
  'test-tube': ['1f9ea', 'flask-conical', 'an experiment'],
  // Line only (no emoji): the stages of a data pipeline and the marks of a teaser.
  filter: [null, 'funnel', 'a filter stage (language, quality, safety)'],
  dedup: [null, 'copy-minus', 'deduplication'],
  merge: [null, 'merge', 'merging sources'],
  code: [null, 'code-xml', 'code, a program'],
  annotator: [null, 'user-pen', 'a human annotator, labelling'],
  inspect: [null, 'scan-search', 'inspection, a classifier or detector'],
  layers: [null, 'layers', 'a stack, mixed sources'],
  archive: [null, 'archive', 'an archive, packed training data'],
  shard: [null, 'file-archive', 'a data shard (tar, WebDataset)'],
  language: [null, 'languages', 'language identification, translation'],
  tag: [null, 'tag', 'labels, captions, metadata'],
  'check-circle': [null, 'circle-check', 'passed, kept'],
  'cross-circle': [null, 'circle-x', 'failed, dropped']
}

export const ICON_VARIANTS = ['emoji', 'line']

/** The vendored file of an icon, relative to the harness. */
export function iconFile(name, variant = 'emoji') {
  const entry = FIGURE_ICONS[name]
  if (!entry) {
    throw new Error(`Unknown icon "${name}". Icons: ${Object.keys(FIGURE_ICONS).join(', ')}`)
  }
  // Why line for some: pipeline and teaser marks have no emoji worth printing.
  return variant === 'line' || !entry[0]
    ? `vendor/icons/lucide/${entry[1]}.svg`
    : `vendor/icons/noto/emoji_u${entry[0]}.svg`
}

/** The icon list as text, for `figures kit icons`. */
export function iconListText() {
  return [
    "fig.icon(name, { id, x, y | cx, cy, size: 18, variant: 'line' | 'emoji', color, fill })",
    '  Line icons (Lucide, one colour; fill colours their closed shapes) by default, vector in exports;',
    "  emoji (Noto) only with variant: 'emoji', since judges read emoji as generated. Use icons for",
    '  actors, modalities and tools; fig.trainable(id) / fig.frozen(id) put a line flame / snowflake on',
    '  a corner. Speech bubbles with text lines: fig.bubble; a preference sign: math \\succ.',
    '',
    ...Object.entries(FIGURE_ICONS).map(
      ([name, [, , meaning]]) => `  ${name.padEnd(12)} ${meaning}`
    )
  ].join('\n')
}
