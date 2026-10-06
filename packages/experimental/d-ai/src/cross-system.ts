/** Audited cross-system capability handoff. */
import { appendAuditRecord, type AuditChain } from './audit-log.ts'
import { authorizeCapability, type CapabilityGrant } from './capability-grants.ts'
import { getSystemManifest, type SystemId } from './systems.ts'
import type { MissionTask } from './task-dag.ts'


/** Stable capability required when a Director task crosses system boundaries. */
export const CROSS_SYSTEM_TASK_EXECUTION_CAPABILITY = 'runtime.task-execute'

/**
 * Determine which systems must hand durable task context into the target
 * system. Dependency systems are the source of truth; plans with no
 * dependencies fall back to the plan's primary system.
 */
export function deriveTaskHandoffSources(
  primarySystem: SystemId,
  task: MissionTask,
  dependencies: readonly MissionTask[],
): readonly SystemId[] {
  const byId = new Map(dependencies.map(dependency => [dependency.id, dependency]))
  const sources = new Set<SystemId>()

  if (task.dependsOn.length === 0) {
    sources.add(primarySystem)
  } else {
    for (const dependencyId of task.dependsOn) {
      const dependency = byId.get(dependencyId)
      if (dependency === undefined) {
        throw new Error('task handoff dependency is missing from durable task state: ' + dependencyId)
      }
      sources.add(dependency.systemId)
    }
  }

  sources.delete(task.systemId)
  return Object.freeze([...sources])
}

export interface CrossSystemRequest {
  readonly id: string
  readonly actorId: string
  readonly fromSystem: SystemId
  readonly toSystem: SystemId
  readonly capability: string
  readonly missionId: string
  readonly projectId?: string
  readonly taskId?: string
  readonly at: string
  readonly reason: string
}

export interface CrossSystemHandoff {
  readonly request: CrossSystemRequest
  readonly authorizedByGrant: string
  readonly audit: AuditChain
}

export function authorizeCrossSystemHandoff(
  grants: readonly CapabilityGrant[],
  audit: AuditChain,
  request: CrossSystemRequest,
): CrossSystemHandoff {
  if (request.fromSystem === request.toSystem) throw new Error('Cross-system handoff requires distinct systems')
  if (request.reason.trim().length === 0) throw new Error('Cross-system handoff reason is required')
  const source = getSystemManifest(request.fromSystem)
  getSystemManifest(request.toSystem)
  if (!source.crossSystem.includes(request.toSystem)) {
    throw new Error(`${request.fromSystem} does not declare cross-system access to ${request.toSystem}`)
  }

  const authorization = authorizeCapability(grants, {
    actorId: request.actorId,
    systemId: request.toSystem,
    capability: request.capability,
    missionId: request.missionId,
    ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    at: request.at,
  })
  if (!authorization.allowed || authorization.grantId === undefined) {
    throw new Error(`Cross-system handoff denied: ${authorization.reason}`)
  }

  const nextAudit = appendAuditRecord(audit, {
    id: `handoff:${request.id}`,
    at: request.at,
    actorId: request.actorId,
    action: 'CROSS_SYSTEM_HANDOFF',
    systemId: request.fromSystem,
    missionId: request.missionId,
    ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
    subjectId: request.toSystem,
    details: {
      capability: request.capability,
      grantId: authorization.grantId,
      reason: request.reason,
    },
  })

  return Object.freeze({
    request: Object.freeze({ ...request }),
    authorizedByGrant: authorization.grantId,
    audit: nextAudit,
  })
}
