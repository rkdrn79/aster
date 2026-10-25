import type { ResearchPairwiseVerdict } from '../../../../shared/research/research-sample-ratings'

export type ABChoice = 'left' | 'right' | 'tie'

function mixedHash(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  // Why: FNV's low bits track character parity, so similar IDs would alternate sides predictably.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return hash >>> 0
}

/** Blind A/B shows B on the left for about half the samples; the same sample keeps its sides. */
export function blindSwapsSides(pairKey: string, sampleId: string): boolean {
  return mixedHash(`${pairKey}\u0000${sampleId}`) >>> 31 === 1
}

/** `a` is the Run shown on the left unless the sides are swapped. */
export function verdictForChoice(choice: ABChoice, swapped: boolean): ResearchPairwiseVerdict {
  if (choice === 'tie') {
    return 'tie'
  }
  return (choice === 'left') !== swapped ? 'a' : 'b'
}

export function choiceForVerdict(verdict: ResearchPairwiseVerdict, swapped: boolean): ABChoice {
  if (verdict === 'tie') {
    return 'tie'
  }
  return (verdict === 'a') !== swapped ? 'left' : 'right'
}
