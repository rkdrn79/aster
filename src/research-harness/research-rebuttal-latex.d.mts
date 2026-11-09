import type { RebuttalBundle } from './research-rebuttal-model.mjs'

export function escapeLatex(value: string): string
export function latexFromMarkdown(markdown: string): string
/** The one-page rebuttal source and the clusters it still lacks a draft for. */
export function assembleRebuttalLatex(bundle: RebuttalBundle): { text: string; missing: string[] }
