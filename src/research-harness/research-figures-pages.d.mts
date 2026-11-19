export type PageWidthPreset = { id: string; label: string; widthIn: number }
export type PageVenue = { id: string; label: string; single: number | null; double: number }

export const PAGE_WIDTHS: readonly PageWidthPreset[]
export const PAGE_VENUES: readonly PageVenue[]
