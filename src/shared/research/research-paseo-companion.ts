export type PaseoCompanionScope = { hostId: string; workspaceId: string; workspacePath: string }

export type PaseoCompanionAgent = {
  id: string
  name: string
  provider: string
  status: string
  cwd: string
}

export type PaseoCompanionProvider = { id: string; label: string }
