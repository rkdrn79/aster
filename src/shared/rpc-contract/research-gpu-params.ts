import { z } from 'zod'
import { RESEARCH_GPU_PRIORITIES } from '../research/research-gpu-policy'
import {
  OptionalBoolean,
  OptionalPositiveInt,
  OptionalString,
  requiredString
} from './rpc-param-primitives'

export const ResearchGpuStatusParams = z.object({
  /** SSH host label, ssh-config alias or target id; all hosts with GPU limits when absent. */
  server: OptionalString
})

export const ResearchGpuSubmitParams = z.object({
  server: requiredString('Missing --server'),
  /** A project named in the host's GPU limits (Aster > Compute). */
  project: requiredString('Missing --project'),
  workDir: requiredString('Missing --workdir'),
  script: OptionalString,
  command: OptionalString,
  gpus: OptionalPositiveInt,
  partition: OptionalString,
  cpusPerTask: OptionalPositiveInt,
  memory: OptionalString,
  timeLimit: OptionalString,
  jobName: OptionalString,
  /** `<experiment>/<run-id>`: the job writes that Run's train.log and its state into run.json. */
  linkRun: OptionalString,
  /** The project root holding research/ on the host; defaults to workDir. */
  runProject: OptionalString,
  /** sbatch --test-only: the start estimate and budget verdict, without creating a job. */
  dryRun: OptionalBoolean
})

/**
 * The desktop's GPU limits for the SSH host this orcad runs on, pushed when the desktop connects
 * and whenever the limits change; `host: null` clears them. Projects are keyed as on the desktop.
 */
export const ResearchGpuHostPolicyParams = z
  .object({
    /** The host's name in Aster, which agents on the server may pass as `--server`. */
    label: z.string().trim().min(1).max(200),
    host: z
      .object({
        maxGpus: z.number().int().min(0).max(1024),
        autoRelease: z.boolean()
      })
      .strict()
      .nullable(),
    projects: z
      .array(
        z
          .object({
            projectKey: z.string().min(1).max(600),
            projectName: z.string().trim().min(1).max(120),
            maxGpus: z.number().int().min(0).max(1024).nullable(),
            priority: z.enum(RESEARCH_GPU_PRIORITIES)
          })
          .strict()
      )
      .max(2000)
  })
  .strict()
