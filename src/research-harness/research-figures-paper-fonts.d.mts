export type PaperFace = { id: number; name: string; file: string }
export const PAPER_SERIF: { cm: PaperFace; times: PaperFace }
export const PAPER_SERIF_IDS: Set<number>
export const PAPER_SERIF_BASELINE: number
export function serifForPreamble(source: string | null | undefined): 'cm' | 'times' | null
export function paperSerif(font: string | null | undefined): (PaperFace & { key: string }) | null
