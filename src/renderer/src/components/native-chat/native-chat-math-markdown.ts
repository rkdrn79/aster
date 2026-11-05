import type { Nodes, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { CommentMarkdownExtension } from '@/components/sidebar/CommentMarkdown'

type InlineMath = Extract<PhrasingContent, { type: 'inlineMath' }>
type DisplayMath = Extract<RootContent, { type: 'math' }>

/** Whether remark-math read this from `$$…$$`, which TeX and KaTeX's auto-render set as display. */
function isDoubleDollarMath(node: PhrasingContent, source: string): node is InlineMath {
  if (node.type !== 'inlineMath') {
    return false
  }
  const offset = node.position?.start.offset
  return offset !== undefined && source.startsWith('$$', offset)
}

function displayMath(node: InlineMath): DisplayMath {
  return {
    type: 'math',
    meta: null,
    value: node.value,
    position: node.position,
    // The element remark-math gives a `$$` block, which rehype-katex typesets as display.
    data: {
      hName: 'pre',
      hChildren: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-math', 'math-display'] },
          children: [{ type: 'text', value: node.value }]
        }
      ]
    }
  }
}

function isBlankInline(node: PhrasingContent): boolean {
  return node.type === 'break' || (node.type === 'text' && node.value.trim() === '')
}

/** The words on one side of a display, without the line breaks and spaces that led to it. */
function trimmedParagraph(children: PhrasingContent[]): Paragraph | null {
  let start = 0
  let end = children.length
  while (start < end && isBlankInline(children[start])) {
    start += 1
  }
  while (end > start && isBlankInline(children[end - 1])) {
    end -= 1
  }
  if (start === end) {
    return null
  }
  const kept = children.slice(start, end)
  const first = kept[0]
  const last = kept.at(-1)
  if (first.type === 'text') {
    first.value = first.value.trimStart()
  }
  if (last?.type === 'text') {
    last.value = last.value.trimEnd()
  }
  return { type: 'paragraph', children: kept }
}

function splitAtDisplayMath(paragraph: Paragraph, source: string): RootContent[] | null {
  if (!paragraph.children.some((child) => isDoubleDollarMath(child, source))) {
    return null
  }
  const blocks: RootContent[] = []
  let words: PhrasingContent[] = []
  for (const child of paragraph.children) {
    if (isDoubleDollarMath(child, source)) {
      const before = trimmedParagraph(words)
      if (before) {
        blocks.push(before)
      }
      blocks.push(displayMath(child))
      words = []
    } else {
      words.push(child)
    }
  }
  const after = trimmedParagraph(words)
  if (after) {
    blocks.push(after)
  }
  return blocks
}

function splitDisplayMathIn(node: Nodes, source: string): void {
  if (!('children' in node)) {
    return
  }
  const children: Nodes[] = node.children
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    const blocks = child.type === 'paragraph' ? splitAtDisplayMath(child, source) : null
    if (blocks) {
      children.splice(index, 1, ...blocks)
      index += blocks.length - 1
    } else if (child.type !== 'paragraph') {
      splitDisplayMathIn(child, source)
    }
  }
}

/** remark-math keeps `$$…$$` written inside a paragraph inline; a reply means it as display, so its
 *  paragraph is cut around it. Headings and table cells keep it inline. */
function remarkDisplayMathText(): (tree: Root, file: { value: unknown }) => void {
  return (tree, file) => {
    const source = typeof file.value === 'string' ? file.value : ''
    if (source.includes('$$')) {
      splitDisplayMathIn(tree, source)
    }
  }
}

type MarkdownPlugins = CommentMarkdownExtension['remarkPlugins']

const MATH_REMARK_PLUGINS: MarkdownPlugins = [remarkMath, remarkDisplayMathText]

// KaTeX runs after sanitize, so its markup and inline styles are not stripped; sanitize only has to
// keep remark-math's `language-math` class, which the default schema allows on `code`. With `trust`
// off, KaTeX makes no links, raw HTML or images from the TeX.
const MATH_REHYPE_PLUGINS: MarkdownPlugins = [
  [
    rehypeKatex,
    {
      // Invalid TeX shows as its source in this color, with KaTeX's message as its title.
      errorColor: 'var(--destructive)',
      // Strict mode only warns on the console, about text like Unicode letters in math.
      strict: false
    }
  ]
]

/** Typesets the TeX in a reply that prepareNativeChatMath has put in dollar delimiters. */
const NATIVE_CHAT_MATH_EXTENSION: CommentMarkdownExtension = {
  remarkPlugins: MATH_REMARK_PLUGINS,
  sanitizeAttributes: {},
  rehypePlugins: MATH_REHYPE_PLUGINS,
  components: {}
}

export function withNativeChatMath(
  extension: CommentMarkdownExtension | undefined
): CommentMarkdownExtension {
  if (!extension) {
    return NATIVE_CHAT_MATH_EXTENSION
  }
  return {
    ...extension,
    remarkPlugins: [...extension.remarkPlugins, ...MATH_REMARK_PLUGINS],
    rehypePlugins: [...(extension.rehypePlugins ?? []), ...MATH_REHYPE_PLUGINS]
  }
}
