// Page widths of the canvas and of plots: one table, so a diagram and a plot made for the same
// venue come out the same width. Pure.

/** The width presets the page control offers, in inches. */
export const PAGE_WIDTHS = [
  { id: 'single', label: 'Single', widthIn: 3.25 },
  { id: 'onehalf', label: '1.5-col', widthIn: 5 },
  { id: 'double', label: 'Double', widthIn: 6.75 }
]

/** Column and text widths of the venues people submit to, in inches. */
export const PAGE_VENUES = [
  { id: 'icml', label: 'ICML', single: 3.25, double: 6.75 },
  { id: 'cvpr', label: 'CVPR', single: 3.25, double: 6.875 },
  { id: 'acl', label: 'ACL', single: 3.03, double: 6.3 },
  { id: 'neurips', label: 'NeurIPS', single: null, double: 5.5 },
  { id: 'arxiv', label: 'arXiv', single: null, double: 6.5 }
]
