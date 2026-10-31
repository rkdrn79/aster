import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import type { ResearchComputeWorkspace } from './research-compute-workspaces'
import { isWebClientLocation } from '@/lib/web-client-location'

const MAX_PROBED_WORKSPACE_PATHS = 256

export function failedComputeSample(targetId: string, cause: unknown): ResearchComputeSample {
  return {
    targetId,
    capturedAt: new Date().toISOString(),
    status: 'error',
    via: null,
    message: cause instanceof Error ? cause.message : String(cause),
    remoteUser: null,
    gpu: { status: 'missing', message: null, devices: [], processes: [] },
    slurm: {
      status: 'missing',
      message: null,
      version: null,
      jobs: [],
      queue: [],
      queueTruncated: false,
      nodes: []
    },
    resolvedWorkspacePaths: {}
  }
}

export function computeSampleProblems(sample: ResearchComputeSample): string[] {
  if (sample.status !== 'ok') {
    return sample.message ? [sample.message] : []
  }
  return [
    sample.slurm.status === 'error' ? `SLURM: ${sample.slurm.message}` : null,
    // Why only without SLURM: login nodes commonly lack a GPU driver, so this is expected there.
    sample.gpu.status === 'error' && sample.slurm.status !== 'ok'
      ? `nvidia-smi: ${sample.gpu.message}`
      : null
  ].filter((message): message is string => message !== null)
}

/** Folders the probe resolves on the host, and which project owns each for the GPU scheduler. */
export function computeProbeFolders(workspaces: readonly ResearchComputeWorkspace[]): {
  workspacePaths: string[]
  projectFolders: { path: string; projectKey: string }[]
} {
  const projectFolders = workspaces
    .filter(({ path }) => path.startsWith('/') && !/[\0\t\n\r]/.test(path))
    .slice(0, MAX_PROBED_WORKSPACE_PATHS)
    .map(({ path, projectKey }) => ({ path, projectKey }))
  return { workspacePaths: projectFolders.map(({ path }) => path), projectFolders }
}

/**
 * What this window's preload offers. Why: in dev the renderer hot-reloads ahead of main and
 * preload, and a paired client can be newer than its host; a missing bridge method hides its UI.
 */
export function computeBridgeCapabilities(): { jobs: boolean; links: boolean; gpuPolicy: boolean } {
  // Why: the web client's fallback proxy makes every bridge method look callable.
  if (isWebClientLocation()) {
    return { jobs: false, links: false, gpuPolicy: false }
  }
  const api: Partial<Window['api']['researchCompute']> = window.api.researchCompute ?? {}
  return {
    jobs: typeof api.submitJob === 'function' && typeof api.cancelJob === 'function',
    links: typeof api.readLinks === 'function' && typeof api.saveLinks === 'function',
    gpuPolicy: typeof api.readGpuPolicy === 'function' && typeof api.saveGpuPolicy === 'function'
  }
}
