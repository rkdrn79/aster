import { useState } from 'react'
import { ChevronRight, ListChecks } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AgentStepRow, type AgentStepStatus } from '@/components/ai/agent-steps'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  diffNativeChatTaskLists,
  nativeChatTaskChangeWords,
  nativeChatTaskLabel,
  type NativeChatTask,
  type NativeChatTaskChange,
  type NativeChatTaskList as TaskList
} from '../../../../shared/native-chat-task-list'

function statusLabel(task: NativeChatTask): string {
  if (task.status === 'completed') {
    return translate('components.native-chat.taskList.completed', 'Completed')
  }
  if (task.status === 'in_progress') {
    return translate('components.native-chat.taskList.inProgress', 'In progress')
  }
  return translate('components.native-chat.taskList.pending', 'Pending')
}

function changeLabel(change: NativeChatTaskChange): string {
  const { key, task } = nativeChatTaskChangeWords(change)
  switch (key) {
    case 'added':
      return translate('components.native-chat.taskList.added', 'Added {{task}}', { task })
    case 'removed':
      return translate('components.native-chat.taskList.removed', 'Removed {{task}}', { task })
    case 'started':
      return translate('components.native-chat.taskList.started', 'Started {{task}}', { task })
    case 'finished':
      return translate('components.native-chat.taskList.finished', 'Completed {{task}}', { task })
    case 'reset':
      return translate('components.native-chat.taskList.reset', 'Marked pending: {{task}}', {
        task
      })
    case 'updated':
      return translate('components.native-chat.taskList.updated', 'Updated {{task}}', { task })
  }
}

const STEP_STATUS: Record<NativeChatTask['status'], AgentStepStatus> = {
  completed: 'done',
  in_progress: 'running',
  pending: 'pending'
}

function TaskRow({ task, label }: { task: NativeChatTask; label?: string }): React.JSX.Element {
  return (
    <AgentStepRow
      status={STEP_STATUS[task.status]}
      className={cn(
        task.status === 'in_progress'
          ? 'font-medium text-chat-foreground-strong'
          : 'text-chat-foreground-faint'
      )}
    >
      <span className="sr-only">{statusLabel(task)}: </span>
      <span
        className={cn(
          'min-w-0 whitespace-pre-wrap break-words',
          !label &&
            task.status === 'completed' &&
            'line-through decoration-chat-foreground-faint/50 transition-colors'
        )}
      >
        {label ?? nativeChatTaskLabel(task)}
      </span>
    </AgentStepRow>
  )
}

function Checklist({ list }: { list: TaskList }): React.JSX.Element {
  return list.tasks.length === 0 ? (
    <p className="text-xs">{translate('components.native-chat.taskList.empty', 'No tasks')}</p>
  ) : (
    <ul
      aria-label={translate('components.native-chat.taskList.title', 'Tasks')}
      className="space-y-0.5 py-1"
    >
      {list.tasks.map((task, index) => (
        <TaskRow key={`${task.content}:${index}`} task={task} />
      ))}
    </ul>
  )
}

/** The plan docked above the composer: one quiet bar that opens to the checklist. Folded, it
 *  still says what is running now (a visual echo only: the list is the readable copy). */
function DockedChecklist({
  list,
  completed
}: {
  list: TaskList
  completed: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const running = open ? undefined : list.tasks.find((task) => task.status === 'in_progress')
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <div className="rounded-[calc(var(--radius-md)+--spacing(2))] bg-chat-composer-surface shadow-raised">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-2 rounded-[calc(var(--radius-md)+--spacing(2))] px-3 py-2 text-left text-xs text-chat-foreground-faint transition-colors duration-(--duration-fast) hover:text-chat-foreground-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ListChecks aria-hidden className="size-4 shrink-0" />
            <span className="shrink-0 font-medium text-chat-foreground">
              {translate('components.native-chat.taskList.title', 'Tasks')}
            </span>
            <span aria-hidden className="min-w-0 flex-1 truncate">
              {/* Still text: the turn's activity line is the one place a sweep plays. */}
              {running ? (
                <span className="text-chat-foreground">{nativeChatTaskLabel(running)}</span>
              ) : null}
            </span>
            <span
              className="tabular-nums"
              aria-label={translate(
                'components.native-chat.taskList.progress',
                '{{completed}} of {{total}} tasks completed',
                { completed, total: list.tasks.length }
              )}
            >
              {completed}/{list.tasks.length}
            </span>
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform duration-(--duration-fast) ease-out-quint group-data-[state=open]:rotate-90 motion-reduce:transition-none"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent data-native-chat-reveal="">
          <div className="max-h-44 overflow-y-auto px-3 pb-3 text-sm scrollbar-sleek">
            <Checklist list={list} />
            {list.explanation ? (
              <p className="whitespace-pre-wrap break-words text-xs text-chat-foreground-faint">
                {list.explanation}
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function NativeChatTaskList({
  list,
  previous,
  presentation = 'inline'
}: {
  list: TaskList
  previous?: TaskList
  presentation?: 'inline' | 'composer'
}): React.JSX.Element {
  const completed = list.tasks.filter((task) => task.status === 'completed').length
  if (presentation === 'composer') {
    return <DockedChecklist list={list} completed={completed} />
  }
  const changes = previous ? diffNativeChatTaskLists(previous, list) : null
  return (
    <div className="space-y-1 py-1 text-sm text-chat-foreground-faint">
      <div className="flex items-center gap-2 text-xs text-chat-foreground-faint">
        <ListChecks aria-hidden className="size-4 shrink-0" />
        <span className="font-medium">
          {translate('components.native-chat.taskList.title', 'Tasks')}
        </span>
        <span
          className="tabular-nums"
          aria-label={translate(
            'components.native-chat.taskList.progress',
            '{{completed}} of {{total}} tasks completed',
            { completed, total: list.tasks.length }
          )}
        >
          {completed}/{list.tasks.length}
        </span>
      </div>
      {changes ? (
        <>
          {changes.length > 0 ? (
            <ul className="space-y-1 py-1">
              {changes.map((change, index) => (
                <TaskRow
                  key={`${change.kind}:${index}`}
                  task={change.task}
                  label={changeLabel(change)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-chat-foreground-faint">
              {translate('components.native-chat.taskList.unchanged', 'Tasks unchanged')}
            </p>
          )}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex items-center gap-1 rounded py-0.5 text-xs text-chat-foreground-faint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform duration-(--duration-fast) ease-out-quint group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                />
                {translate('components.native-chat.taskList.showAll', 'Full task list')}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent data-native-chat-reveal="" data-native-chat-member-detail>
              <Checklist list={list} />
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <Checklist list={list} />
      )}
      {list.explanation ? (
        <p className="whitespace-pre-wrap break-words text-xs text-chat-foreground-faint">
          {list.explanation}
        </p>
      ) : null}
    </div>
  )
}
