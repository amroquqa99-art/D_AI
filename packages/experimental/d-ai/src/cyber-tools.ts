import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CyberAuthorizationScope, CyberFinding } from './cyber-state.ts'
import { encodeToolResult, jsonToolOutput, rejectInvalidInput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface CyberToolRuntime {
  createCybersecurity(
    agent: Agent,
    objective: string,
    authorization: CyberAuthorizationScope,
    signal?: AbortSignal,
  ): Promise<unknown>
  readCybersecurity(agent: Agent): unknown
  addCyberFinding(
    agent: Agent,
    engagementId: string,
    input: {
      title: string
      severity: CyberFinding['severity']
      evidence: string
      remediation: string
    },
  ): Promise<unknown>
  recordCyberRemediation(
    agent: Agent,
    engagementId: string,
    findingId: string,
    remediationNote: string,
  ): Promise<unknown>
  recordCyberRetest(
    agent: Agent,
    engagementId: string,
    findingId: string,
    retestEvidence: string,
  ): Promise<unknown>
  delegateCybersecurity(agent: Agent, engagementId: string, signal: AbortSignal): Promise<unknown>
}

export function registerCyberTools(
  ctx: Context,
  runtime: CyberToolRuntime,
  owner: ToolOwnerResolver,
  workerTimeoutMs: number,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_create',
    description: 'Create an authorized defensive Cybersecurity engagement with an explicit target scope and permitted actions.',
    parameters: {
      objective: { type: 'string', required: true },
      target_description: { type: 'string', required: true },
      permitted_actions: { type: 'string', required: true },
      approved_by: { type: 'string', required: true },
      issued_at: { type: 'string', required: true },
      expires_at: { type: 'string' },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const permittedActions = args.permitted_actions
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)

      return encodeToolResult(runtime.createCybersecurity(owner(exec.agent), args.objective, {
        targetDescription: args.target_description,
        permittedActions,
        approvedBy: args.approved_by,
        issuedAt: args.issued_at,
        ...(args.expires_at === undefined ? {} : { expiresAt: args.expires_at }),
      }, exec.signal))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_read',
    description: 'Read authorized Cybersecurity engagements, scope, findings, remediation, retests and review outputs.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.readCybersecurity(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_add_finding',
    description: 'Append a defensive finding with observed evidence and remediation guidance.',
    parameters: {
      engagement_id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      severity: { type: 'string', required: true },
      evidence: { type: 'string', required: true },
      remediation: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => {
      const severities = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
      if (!severities.includes(args.severity as typeof severities[number])) {
        rejectInvalidInput('invalid cyber finding severity')
      }
      return encodeToolResult(runtime.addCyberFinding(owner(exec.agent), args.engagement_id, {
        title: args.title,
        severity: args.severity as CyberFinding['severity'],
        evidence: args.evidence,
        remediation: args.remediation,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_record_remediation',
    description: 'Record remediation applied by an engineer for a known defensive finding.',
    parameters: {
      engagement_id: { type: 'string', required: true },
      finding_id: { type: 'string', required: true },
      remediation_note: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.recordCyberRemediation(
      owner(exec.agent),
      args.engagement_id,
      args.finding_id,
      args.remediation_note,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_record_retest',
    description: 'Record evidence from an authorized safe retest after remediation.',
    parameters: {
      engagement_id: { type: 'string', required: true },
      finding_id: { type: 'string', required: true },
      retest_evidence: { type: 'string', required: true },
    },
    output: jsonToolOutput,
    execute: (args, exec) => encodeToolResult(runtime.recordCyberRetest(
      owner(exec.agent),
      args.engagement_id,
      args.finding_id,
      args.retest_evidence,
    )),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_cyber_delegate',
    description: 'Run fresh independent defensive assessment and remediation-review Agents inside the recorded authorization scope.',
    parameters: { engagement_id: { type: 'string', required: true } },
    output: jsonToolOutput,
    timeoutMs: workerTimeoutMs * 2 + 10000,
    execute: (args, exec) => encodeToolResult(
      runtime.delegateCybersecurity(owner(exec.agent), args.engagement_id, exec.signal),
    ),
  }))
}
