import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

export const RESEARCH_GPU_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['gpu', 'status'],
    summary: 'Show your GPU budget on SLURM hosts and the jobs Aster holds for it',
    usage: `${CLI_NAME} gpu status [--server <name>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'server'],
    notes: [
      'Budgets are the limits set in Aster > Compute: your max GPUs per host, and a cap and priority per project.',
      'availableGpus is the budget room left now; jobs beyond it wait held until Aster releases them.'
    ],
    examples: [`${CLI_NAME} gpu status --json`, `${CLI_NAME} gpu status --server my-cluster`]
  },
  {
    path: ['gpu', 'submit'],
    summary: 'Submit a SLURM job under a project GPU budget (held when over budget)',
    usage: `${CLI_NAME} gpu submit --server <name> --project <name> --workdir <path> (--script <path> | --run <command>) --gpus <n> [--partition <p>] [--cpus <n>] [--mem <size>] [--time <limit>] [--name <job>] [--link-run <experiment>/<run-id> [--run-project <path>]] [--dry-run] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'server',
      'project',
      'workdir',
      'script',
      'run',
      'gpus',
      'partition',
      'cpus',
      'mem',
      'time',
      'name',
      'link-run',
      'run-project',
      'dry-run'
    ],
    notes: [
      'Over-budget jobs are submitted with --hold and released by Aster in priority order as GPUs free up.',
      '--dry-run asks the scheduler for a start estimate and the budget verdict without creating a job.',
      'The job is tagged with its project, so it counts toward that project wherever it runs.',
      "--link-run ties the job to an existing Run under .aster/experiments/ (research/experiments/ in older projects) in --run-project (default --workdir): its output goes to the Run's train.log, run.json records the job, and Aster writes how the job ended there."
    ],
    examples: [
      `${CLI_NAME} gpu submit --server my-cluster --project my-paper --workdir /scratch/me/my-paper --script scripts/train.sbatch --gpus 2 --dry-run`,
      `${CLI_NAME} gpu submit --server gpu-cluster --project my-paper --workdir /home/me/my-paper --run "python train.py" --gpus 1 --time 4:00:00`,
      `${CLI_NAME} gpu submit --server my-cluster --project my-paper --workdir /scratch/me/my-paper --script scripts/train.sbatch --gpus 2 --link-run lora-r16/seed-42`
    ]
  }
]
