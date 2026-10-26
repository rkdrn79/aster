export type ResearchHostToolsStatus = {
  state: 'preparing' | 'ready' | 'error'
  node: boolean
  npm: boolean
  pdf: boolean
  detail: string | null
}
