import { z } from 'zod'
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
