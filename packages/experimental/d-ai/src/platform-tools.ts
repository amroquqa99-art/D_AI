import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LOCAL_INTELLIGENCE_CORE } from './systems.ts'
import type { SystemManifest } from './systems.ts'
import { encodeToolResult, jsonToolOutput } from './tool-support.ts'
import type { ToolOwnerResolver } from './tool-support.ts'

export interface PlatformToolRuntime {
  platformSnapshot(agent: Agent): Readonly<Record<string, unknown>>
  systems(): readonly SystemManifest[]
}

export function registerPlatformTools(
  ctx: Context,
  runtime: PlatformToolRuntime,
  owner: ToolOwnerResolver,
): void {
  ctx.tools.register(defineTool({
    name: 'd_ai_platform_snapshot',
    description: 'Read a consolidated D_AI control-center snapshot: domain counts, task states, grants/audit, budgets, evidence graph and system readiness.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => encodeToolResult(runtime.platformSnapshot(owner(exec.agent))),
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_systems_list',
    description: 'Read the authoritative D_AI first-class system registry and truthful execution/readiness status. PARTIAL means a native slice exists but is not yet fully production-complete.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => {
      owner(exec.agent)
      return encodeToolResult(runtime.systems())
    },
  }))

  ctx.tools.register(defineTool({
    name: 'd_ai_local_core_status',
    description: 'Read the governed Local Intelligence Core manifest. This reports architecture and status only; FOUNDATION does not imply a trained model exists.',
    parameters: {},
    output: jsonToolOutput,
    execute: (_args, exec) => {
      owner(exec.agent)
      return encodeToolResult(LOCAL_INTELLIGENCE_CORE)
    },
  }))
}
