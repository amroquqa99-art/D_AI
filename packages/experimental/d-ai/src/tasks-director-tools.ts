import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DirectorLedger, DirectorPlan, DirectorState } from './director-state.ts'
import type { DirectorScheduleLedger, DirectorScheduleState } from './director-schedule-state.ts'
import type { DirectorPlanningResult } from './director-orchestration.ts'
import type { TaskExecutionResult } from './director-executor.ts'
import type { DirectorCycleResult, DirectorPlanRuntimeView } from './director-runtime.ts'
import { SYSTEMS } from './state.ts'
import type { DurableTaskLedger, TaskLedgerState } from './task-ledger-state.ts'
import type { MissionTask, TaskState } from './task-dag.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface TasksDirectorToolRuntime {
  readTaskLedger(agent: Agent): TaskLedgerState
  addDurableTasks(agent: Agent, tasks: readonly MissionTask[]): Promise<DurableTaskLedger>
  transitionDurableTask(agent: Agent, taskId: string, next: TaskState): Promise<DurableTaskLedger>
  readDirector(agent: Agent): DirectorState
  createDirectorPlan(
    agent: Agent,
    input: {
      readonly objective: string
      readonly primarySystem: DirectorPlan['primarySystem']
      readonly stopConditions?: readonly string[]
    },
    signal?: AbortSignal,
  ): Promise<DirectorPlan>
  addDirectorTask(
    agent: Agent,
    planId: string,
    input: {
      readonly systemId: MissionTask['systemId']
      readonly title: string
      readonly dependsOn?: readonly string[]
      readonly priority?: number
      readonly maxAttempts?: number
    },
  ): Promise<DurableTaskLedger>
  generateDirectorTasks(agent: Agent, planId: string, signal: AbortSignal): Promise<Readonly<{ planning: DirectorPlanningResult; ledger: DurableTaskLedger }>>
  executeNextDirectorTask(
    agent: Agent,
    planId: string,
    signal: AbortSignal,
    ttlMs?: number,
  ): Promise<Readonly<{ task: MissionTask; execution: TaskExecutionResult }>>
  directorPlanView(agent: Agent, planId: string, maxTasks?: number): DirectorPlanRuntimeView
  executeDirectorCycle(
    agent: Agent,
    planId: string,
    signal: AbortSignal,
    maxTasks?: number,
    ttlMs?: number,
    maxParallelTasks?: number,
  ): Promise<DirectorCycleResult>
  setDirectorPlanStatus(
    agent: Agent,
    planId: string,
    status: DirectorPlan['status'],
    signal?: AbortSignal,
  ): Promise<DirectorLedger>
  readDirectorSchedule(agent: Agent): DirectorScheduleState
  setDirectorSchedule(
    agent: Agent,
    planId: string,
    input: {
      readonly enabled: boolean
      readonly intervalMs?: number
      readonly maxTasksPerCycle?: number
      readonly maxParallelTasks?: number
      readonly maxConsecutiveFailures?: number
      readonly maxConsecutiveIdleCycles?: number
      readonly resetStagnation?: boolean
      readonly leaseTtlMs?: number
      readonly startImmediately?: boolean
    },
    signal?: AbortSignal,
  ): Promise<DirectorScheduleLedger>
}

export function registerTasksDirectorTools(
  ctx: Context,
  runtime: TasksDirectorToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_tasks_read',
    description: 'Read the durable shared D_AI task ledger, including dependencies, retries and blocking states.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readTaskLedger(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_add',
    description: 'Append one task to the durable D_AI task DAG. Dependencies must reference existing or simultaneously valid task identities in the same mission.',
    parameters: {
      mission_id: { type: 'string', required: true },
      system_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      depends_on: { type: 'string' },
      priority: { type: 'number' },
      max_attempts: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const agent = owner(exec.agent)
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      const dependencies = args.depends_on === undefined
        ? []
        : args.depends_on.split(',').map(value => value.trim()).filter(Boolean)
      const priority = args.priority ?? 0
      const maxAttempts = args.max_attempts ?? 3
      if (!Number.isSafeInteger(priority)
        || !Number.isSafeInteger(maxAttempts)
        || maxAttempts < 1) {
        rejectInvalidInput('invalid task priority or max attempts')
      }

      return encodeToolResult(runtime.addDurableTasks(agent, [{
        id: randomUUID(),
        missionId: args.mission_id,
        systemId: args.system_id as MissionTask['systemId'],
        title: args.title,
        dependsOn: dependencies,
        state: 'PENDING',
        priority,
        attempt: 0,
        maxAttempts,
      }]))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_transition',
    description: 'Apply one validated state transition to a durable D_AI task.',
    parameters: {
      task_id: { type: 'string', required: true },
      next_state: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const states = [
        'PENDING',
        'READY',
        'RUNNING',
        'WAITING_FOR_HUMAN',
        'WAITING_FOR_TOOL',
        'BLOCKED_POLICY',
        'BLOCKED_BUDGET',
        'PAUSED',
        'FAILED',
        'COMPLETED',
        'CANCELLED',
      ] as const
      if (!states.includes(args.next_state as typeof states[number])) {
        rejectInvalidInput('invalid durable task state')
      }
      return encodeToolResult(runtime.transitionDurableTask(
        owner(exec.agent),
        args.task_id,
        args.next_state as TaskState,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_read',
    description: 'Read durable cross-system Mission Director plans. Task state remains authoritative in the shared Task Ledger.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readDirector(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_plan_create',
    description: 'Create a cross-system Mission Director plan from an explicit user objective or after owner approval.',
    parameters: {
      objective: { type: 'string', required: true },
      primary_system: { type: 'string', required: true },
      stop_conditions: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      if (!SYSTEMS.some(system => system.id === args.primary_system)) {
        rejectInvalidInput('unknown primary D_AI system')
      }
      const stopConditions = args.stop_conditions === undefined
        ? []
        : args.stop_conditions.split(/\n+/).map(value => value.trim()).filter(Boolean)
      return encodeToolResult(runtime.createDirectorPlan(owner(exec.agent), {
        objective: args.objective,
        primarySystem: args.primary_system as DirectorPlan['primarySystem'],
        stopConditions,
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_task_add',
    description: 'Add one task to an active Mission Director plan. Dependencies must reference tasks in the same plan.',
    parameters: {
      plan_id: { type: 'string', required: true },
      system_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      depends_on: { type: 'string' },
      priority: { type: 'number' },
      max_attempts: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      if (!SYSTEMS.some(system => system.id === args.system_id)) {
        rejectInvalidInput('unknown D_AI system id')
      }
      return encodeToolResult(runtime.addDirectorTask(owner(exec.agent), args.plan_id, {
        systemId: args.system_id as MissionTask['systemId'],
        title: args.title,
        ...(args.depends_on === undefined
          ? {}
          : { dependsOn: args.depends_on.split(',').map(value => value.trim()).filter(Boolean) }),
        ...(args.priority === undefined ? {} : { priority: args.priority }),
        ...(args.max_attempts === undefined ? {} : { maxAttempts: args.max_attempts }),
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_generate_tasks',
    description: 'Run an isolated Mission Director planner Agent for an empty approved plan. The planner has no tools; its proposed DAG is validated before durable task creation.',
    parameters: { plan_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.generateDirectorTasks(owner(exec.agent), args.plan_id, exec.signal),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_execute_next',
    description: 'Execute exactly one runnable task from an active Mission Director plan using a fresh isolated Agent, durable lease/checkpoint state, dependency-context reconstruction and model routing.',
    parameters: {
      plan_id: { type: 'string', required: true },
      ttl_ms: { type: 'number' },
    },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs + 30000,
    execute: (args, exec) => encodeToolResult(runtime.executeNextDirectorTask(
      owner(exec.agent),
      args.plan_id,
      exec.signal,
      args.ttl_ms ?? 600000,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_execute_cycle',
    description: 'Execute a bounded batch of runnable Mission Director tasks in budget-safe parallel waves. Parallelism is explicit and never exceeds max_tasks; the cycle waits for every started worker before returning or surfacing failure.',
    parameters: {
      plan_id: { type: 'string', required: true },
      max_tasks: { type: 'number' },
      max_parallel_tasks: { type: 'number' },
      ttl_ms: { type: 'number' },
    },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 8 + 60000,
    execute: (args, exec) => {
      const maxTasks = args.max_tasks ?? 4
      if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 8) {
        rejectInvalidInput('max_tasks must be an integer from 1 to 8')
      }
      const maxParallelTasks = args.max_parallel_tasks ?? 1
      if (!Number.isSafeInteger(maxParallelTasks)
        || maxParallelTasks < 1
        || maxParallelTasks > maxTasks) {
        rejectInvalidInput('max_parallel_tasks must be an integer from 1 to max_tasks')
      }
      return encodeToolResult(runtime.executeDirectorCycle(
        owner(exec.agent),
        args.plan_id,
        exec.signal,
        maxTasks,
        args.ttl_ms ?? 600000,
        maxParallelTasks,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_plan_view',
    description: 'Read one Mission Director plan with derived phase, authoritative tasks and budget-aware next runnable work.',
    parameters: {
      plan_id: { type: 'string', required: true },
      max_tasks: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const maxTasks = args.max_tasks ?? 8
      if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 64) {
        rejectInvalidInput('max_tasks must be an integer from 1 to 64')
      }
      return encodeToolResult(runtime.directorPlanView(
        owner(exec.agent),
        args.plan_id,
        maxTasks,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_schedule_read',
    description: 'Read durable unattended Mission Director schedules and their latest cycle receipts.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readDirectorSchedule(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_schedule_set',
    description: 'Enable, update or disable unattended execution for one Mission Director plan. Optional consecutive scheduler-failure/idle thresholds stop future wakes; 0 disables a threshold, and resetting stagnation counters is an explicit human-approved schedule change.'
    parameters: {
      plan_id: { type: 'string', required: true },
      enabled: { type: 'boolean', required: true },
      interval_ms: { type: 'number' },
      max_tasks_per_cycle: { type: 'number' },
      max_parallel_tasks: { type: 'number' },
      max_consecutive_failures: { type: 'number' },
      max_consecutive_idle_cycles: { type: 'number' },
      reset_stagnation: { type: 'boolean' },
      lease_ttl_ms: { type: 'number' },
      start_immediately: { type: 'boolean' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      if (args.interval_ms !== undefined
        && (!Number.isSafeInteger(args.interval_ms) || args.interval_ms < 10)) {
        rejectInvalidInput('interval_ms must be an integer of at least 10 ms')
      }
      if (args.max_tasks_per_cycle !== undefined
        && (!Number.isSafeInteger(args.max_tasks_per_cycle)
          || args.max_tasks_per_cycle < 1
          || args.max_tasks_per_cycle > 8)) {
        rejectInvalidInput('max_tasks_per_cycle must be an integer from 1 to 8')
      }
      if (args.max_parallel_tasks !== undefined
        && (!Number.isSafeInteger(args.max_parallel_tasks)
          || args.max_parallel_tasks < 1
          || args.max_parallel_tasks > (args.max_tasks_per_cycle ?? 8))) {
        rejectInvalidInput('max_parallel_tasks must be an integer from 1 to max_tasks_per_cycle')
      }
      if (args.max_consecutive_failures !== undefined
        && (!Number.isSafeInteger(args.max_consecutive_failures)
          || args.max_consecutive_failures < 0)) {
        rejectInvalidInput('max_consecutive_failures must be a non-negative integer')
      }
      if (args.max_consecutive_idle_cycles !== undefined
        && (!Number.isSafeInteger(args.max_consecutive_idle_cycles)
          || args.max_consecutive_idle_cycles < 0)) {
        rejectInvalidInput('max_consecutive_idle_cycles must be a non-negative integer')
      }
      if (args.lease_ttl_ms !== undefined
        && (!Number.isSafeInteger(args.lease_ttl_ms) || args.lease_ttl_ms < 1)) {
        rejectInvalidInput('lease_ttl_ms must be a positive integer')
      }

      return encodeToolResult(runtime.setDirectorSchedule(
        owner(exec.agent),
        args.plan_id,
        {
          enabled: args.enabled,
          ...(args.interval_ms === undefined ? {} : { intervalMs: args.interval_ms }),
          ...(args.max_tasks_per_cycle === undefined ? {} : { maxTasksPerCycle: args.max_tasks_per_cycle }),
          ...(args.max_parallel_tasks === undefined ? {} : { maxParallelTasks: args.max_parallel_tasks }),
          ...(args.max_consecutive_failures === undefined
            ? {}
            : { maxConsecutiveFailures: args.max_consecutive_failures }),
          ...(args.max_consecutive_idle_cycles === undefined
            ? {}
            : { maxConsecutiveIdleCycles: args.max_consecutive_idle_cycles }),
          ...(args.reset_stagnation === undefined ? {} : { resetStagnation: args.reset_stagnation }),
          ...(args.lease_ttl_ms === undefined ? {} : { leaseTtlMs: args.lease_ttl_ms }),
          ...(args.start_immediately === undefined ? {} : { startImmediately: args.start_immediately }),
        },
        exec.signal,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_director_plan_status',
    description: 'Pause, resume or explicitly complete a Mission Director plan after human approval.',
    parameters: {
      plan_id: { type: 'string', required: true },
      status: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const statuses = ['ACTIVE', 'PAUSED', 'COMPLETE'] as const
      if (!statuses.includes(args.status as typeof statuses[number])) {
        rejectInvalidInput('invalid Mission Director plan status')
      }
      return encodeToolResult(runtime.setDirectorPlanStatus(
        owner(exec.agent),
        args.plan_id,
        args.status as DirectorPlan['status'],
        exec.signal,
      ))
    },
  }))
}
