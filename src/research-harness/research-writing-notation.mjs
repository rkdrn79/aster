/**
 * WN-UNDEFINED: math symbols (single Latin letters and Greek letters, with \mathbf, \hat and the
 * like; subscripts ignored) tracked in reading order across the whole manuscript. A symbol is
 * defined on the left of `=`/`:=`, in a sentence with a definition cue ("let", "denote", "where",
 * "is the", `\in` ...), or in a display equation followed within two sentences by "where".
 */

const DEFINITION_CUE =
  /\b(?:let|denote[sd]?|denoting|where|we (?:define|use|write|call|set|introduce)|defined as|is (?:the|a|an)|are (?:the|a)|represent(?:s|ing)?|refers? to|stands? for|be the|be a|with|given|for (?:each|every|all|any)|parameteri[sz]ed by|indexed by|of size|written as|given by|computed as|as follows|is defined|we obtain|corresponds? to|called|termed|known as)\b/
const GREEK = new Set(
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'.split(
    ' '
  )
)
const DECORATED =
  /\\(?:mathbf|mathcal|mathbb|boldsymbol|bm|hat|tilde|bar|widetilde|widehat|overline|vec|mathsf|mathscr|mathfrak|dot)\{\s*(\\?[A-Za-z]+)\s*\}|\\([A-Za-z]+)|(?<![A-Za-z\\])([A-Za-z])(?![A-Za-z])/g
/** Symbols nobody defines: e (Euler), d in dx, the indices i, j, k and O(·). */
const ALWAYS_KNOWN = new Set(['e', 'd', 'i', 'j', 'k', 'O', '\\mathbb{E}', '\\mathbb{R}'])

/** Notation symbols of a math snippet. */
export function mathSymbols(expression) {
  const cleaned = expression
    .replace(
      /\\(?:label|begin|end|text|mathrm|operatorname|textrm|mbox|textit|textbf|textsf|texttt)\{[^}]*\}/g,
      ' '
    )
    .replace(
      /\\(?:log|exp|max|min|arg|argmax|argmin|sup|inf|lim|sin|cos|tanh|det|tr|diag|Pr|KL|sum|prod|int|cdot|ldots|dots|cdots|left|right|frac|sqrt|in|le|leq|ge|geq|approx|sim|to|times|infty|propto|nabla|partial|quad|qquad|mid|top|odot|otimes|oplus)\b/g,
      ' '
    )
    .replace(/_\{[^}]*\}|_[A-Za-z0-9]/g, ' ')
    // Why: \Delta W and \nabla f are operators on a symbol, not symbols of their own.
    .replace(/\\(?:Delta|delta|nabla)(?=\s*\\?[A-Za-z])/g, ' ')
  const symbols = []
  for (const match of cleaned.matchAll(DECORATED)) {
    if (match[1]) {
      const inner = match[1].replace(/^\\/, '')
      if (inner.length === 1 || GREEK.has(inner)) {
        symbols.push(match[0].replace(/\s+/g, ''))
      }
    } else if (match[2]) {
      if (GREEK.has(match[2])) {
        symbols.push(`\\${match[2]}`)
      }
    } else if (match[3]) {
      symbols.push(match[3])
    }
  }
  return symbols
}

function splitDefinition(expression) {
  const match = /:=|\\coloneqq|\\triangleq|\\doteq|\\equiv|(?<![<>!\\])=/.exec(expression)
  return match
    ? {
        left: expression.slice(0, match.index),
        right: expression.slice(match.index + match[0].length)
      }
    : { left: '', right: expression }
}

/**
 * Walks every paragraph of every section in reading order and reports, for paragraphs in
 * `checked` sections, each symbol whose first use is not a definition. `known` is the project's
 * allowlist (`.aster/writing.json` notationKnown).
 */
export function checkNotation(sections, checked, known, report) {
  const defined = new Set([...ALWAYS_KNOWN, ...known])
  const flagged = new Map()
  for (const section of sections) {
    const reporting = checked.has(section)
    for (const paragraph of section.allProse) {
      paragraph.sentences.forEach((sentence, index) => {
        const cue = DEFINITION_CUE.test(sentence.low)
        const follow = paragraph.sentences
          .slice(index, index + 2)
          .map((entry) => entry.low)
          .join(' ')
        const useSymbols = (expression, defining) => {
          const { left, right } = splitDefinition(expression)
          for (const symbol of mathSymbols(left)) {
            defined.add(symbol)
          }
          for (const symbol of mathSymbols(right)) {
            if (defined.has(symbol)) {
              continue
            }
            if (!defining && reporting && !flagged.has(symbol)) {
              flagged.set(symbol, { sentence, section })
            }
            defined.add(symbol)
          }
        }
        for (const match of sentence.text.matchAll(/\[M(\d+)\]/g)) {
          const expression = paragraph.maths[Number(match[1])] ?? ''
          useSymbols(expression, cue || expression.includes('\\in'))
        }
        for (const match of sentence.text.matchAll(/\[EQ(\d+)\]/g)) {
          const body = (paragraph.displays[Number(match[1])] ?? '').replace(
            /\\(?:begin|end)\{[^}]*\}|\\label\{[^}]*\}/g,
            ' '
          )
          useSymbols(body, /\bwhere\b/.test(follow) || cue)
        }
      })
    }
  }
  for (const [symbol, { sentence, section }] of flagged) {
    report(
      section,
      'WN-UNDEFINED',
      'warning',
      sentence,
      `Symbol ${symbol} is used before it is defined.`,
      `Define it where it first appears ("Let ${symbol} denote ...", or a "where" clause after the equation), or add it to notationKnown in .aster/writing.json if readers know it.`,
      symbol.replace(/^\\/, '')
    )
  }
}
