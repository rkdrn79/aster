export function formatGpuMemory(mebibytes: number | null): string {
  if (mebibytes === null) {
    return 'N/A'
  }
  return mebibytes >= 1024 ? `${(mebibytes / 1024).toFixed(1)} GiB` : `${Math.round(mebibytes)} MiB`
}

export function formatGpuProcessAge(seconds: number | null): string {
  if (seconds === null) {
    return '—'
  }
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return minutes > 0 ? `${minutes}m` : `${Math.max(0, Math.floor(seconds))}s`
}

/** SLURM prints cluster-local time without a zone, so show it as written: `10-24 21:33`. */
export function formatSlurmTimestamp(value: string | null): string {
  const match = value ? /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value) : null
  return match ? `${match[1]}-${match[2]} ${match[3]}:${match[4]}` : (value ?? '—')
}

/** nvidia-smi numbers GPUs in PCI order; CUDA does not unless told to. */
export function cudaVisibleDevicesPrefix(indices: readonly number[]): string {
  const sorted = [...indices].sort((a, b) => a - b)
  return `CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=${sorted.join(',')}`
}
