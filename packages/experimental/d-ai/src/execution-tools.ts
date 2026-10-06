import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ExecutionState, TaskCheckpoint, TaskLease } from './execution-state.ts'
import type { MissionTask } from './task-dag.ts'
import { encodeToolResult, jsonToolOutput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface ExecutionToolRuntime {
  recoverExpiredTaskLeases(agent: Agent): Promise<Readonly<{ recoveredTaskIds: readonly string[]; retryExhaustedTaskIds: readonly string[] }>>
  readExecution(agent: Agent): ExecutionState
  claimNextRunnableTask(agent: Agent, ttlMs: number): Promise<{ readonly task: MissionTask; readonly lease: TaskLease }>
  renewTaskLease(agent: Agent, taskId: string, leaseId: string, fence: number, ttlMs: number): Promise<TaskLease>
  checkpointTask(
    agent: Agent,
    taskId: string,
    leaseId: string,
    fence: number,
    summary: string,
    artifactRefs: readonly string[],
  ): Promise<TaskCheckpoint>
  releaseTaskLease(agent: Agent, taskId: string, leaseId: string, fence: number): Promise<TaskLease>
}

export function registerExecutionTools(
  ctx: Context,
  runtime: ExecutionToolRuntime,
  owner: ToolOwnerResolver,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_execution_recover_expired',
    description: 'Recover tasks stranded by expired execution leases, respecting task retry budgets. Active leases are never touched.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(
      runtime.recoverExpiredTaskLeases(owner(exec.agent)),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_execution_read',
    description: 'Read durable D_AI task leases and checkpoints for long-running execution.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readExecution(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_claim_next',
    description: 'Claim the highest-priority runnable D_AI task, move it to RUNNING and acquire a durable execution lease. Budget and dependency admission are enforced.',
    parameters: { ttl_ms: { type: 'number' } },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.claimNextRunnableTask(owner(exec.agent), args.ttl_ms ?? 300000),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_renew_lease',
    description: 'Extend one exact execution-lease generation. lease_id + fence prevent stale workers from renewing a newer executor lease.',
    parameters: {
      task_id: { type: 'string', required: true },
      lease_id: { type: 'string', required: true },
      fence: { type: 'number', required: true },
      ttl_ms: { type: 'number' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.renewTaskLease(
        owner(exec.agent),
        args.task_id,
        args.lease_id,
        args.fence,
        args.ttl_ms ?? 300000,
      ),
    ),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_checkpoint',
    description: 'Persist a resumable checkpoint for one exact active lease generation. Stale lease fences are rejected.',
    parameters: {
      task_id: { type: 'string', required: true },
      lease_id: { type: 'string', required: true },
      fence: { type: 'number', required: true },
      summary: { type: 'string', required: true },
      artifact_refs: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.checkpointTask(
      owner(exec.agent),
      args.task_id,
      args.lease_id,
      args.fence,
      args.summary,
      args.artifact_refs === undefined
        ? []
        : args.artifact_refs.split(/[\n,]+/).map(value => value.trim()).filter(Boolean),
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_task_release_lease',
    description: 'Release one exact execution-lease generation. A stale worker cannot release a newer executor lease.',
    parameters: {
      task_id: { type: 'string', required: true },
      lease_id: { type: 'string', required: true },
      fence: { type: 'number', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(
      runtime.releaseTaskLease(owner(exec.agent), args.task_id, args.lease_id, args.fence),
    ),
  }))
}
