import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function source(relative: string): Promise<string> {
  return readFile(new URL('../src/' + relative, import.meta.url), 'utf8')
}

describe('D_AI runtime architecture boundaries', () => {
  it('keeps the composition root free from direct native tool definitions', async () => {
    const index = await source('index.ts')

    expect(index).not.toContain("from '@deepseek-ai/dsh-tools'")
    expect(index).not.toContain('defineTool(')

    expect(index).toContain('registerDaiTools(this.ctx, this, owner')
    expect(index).not.toContain('registerScientificTools(')
    expect(index).not.toContain('registerInvestorTools(')
    expect(index).not.toContain('registerCyberTools(')
    expect(index).not.toContain('registerOperationsTools(')
    expect(index).not.toContain('registerInnovationTools(')
    expect(index).not.toContain('registerInvestigationTools(')
  })

  it('centralizes bounded-context tool composition in runtime-tools', async () => {
    const runtimeTools = await source('runtime-tools.ts')
    const registrars = [
      'registerPlatformTools',
      'registerTasksDirectorTools',
      'registerModelsTrainingTools',
      'registerExecutionTools',
      'registerEvidenceControlTools',
      'registerScientificTools',
      'registerInvestorTools',
      'registerCyberTools',
      'registerOperationsTools',
      'registerInnovationTools',
      'registerInvestigationTools',
    ]

    for (const registrar of registrars) {
      expect(runtimeTools).toContain(registrar + '(')
    }
    expect(runtimeTools).not.toContain('defineTool(')
  })

  it('keeps deployment configuration and projection registration out of the composition root', async () => {
    const [index, config, projections] = await Promise.all([
      source('index.ts'),
      source('config.ts'),
      source('runtime-projections.ts'),
    ])

    expect(index).toContain('buildRuntimeConfiguration(config)')
    expect(index).toContain('mountDaiProjections(ctx)')
    expect(index).not.toContain('sessionProjections.register(')

    expect(config).toContain('export function buildRuntimeConfiguration')
    expect(projections).toContain('export function mountDaiProjections')
  })

  it('routes owner, turn and mutation-order invariants through the shared runtime kernel', async () => {
    const [index, kernel] = await Promise.all([
      source('index.ts'),
      source('runtime-kernel.ts'),
    ])

    expect(index).toContain('new DaiRuntimeKernel(ctx)')
    expect(index).toContain('this.kernel.authorizeOwner(agent)')
    expect(index).toContain('this.kernel.requireOpenTurn(agent)')
    expect(index).toContain('this.kernel.transact(agent, operation)')
    expect(index).toContain('this.kernel.drain()')
    expect(index).not.toContain('private readonly tails = new Map')
    expect(index).not.toContain('this.ctx.agents.get(agent.id) !== agent')

    expect(kernel).toContain('private readonly tails = new Map')
    expect(kernel).toContain('authorizeOwner(agent: Agent)')
    expect(kernel).toContain('requireOpenTurn(agent: Agent)')
    expect(kernel).toContain('async transact<T>')
  })

  it('centralizes typed projection reads and immutable snapshots', async () => {
    const [index, state] = await Promise.all([
      source('index.ts'),
      source('runtime-state.ts'),
    ])

    expect(index).toContain('new DaiProjectionReader(ctx, this.kernel)')
    expect(index).not.toContain('sessionProjections.stateOf(')
    expect(index).not.toContain('structuredClone(value)')

    expect(state).toContain('SessionProjectionStateMap')
    expect(state).toContain('class DaiProjectionReader')
    expect(state).toContain('immutableSnapshot')
    expect(state).toContain("'D_AI_PROJECTION_MISSING'")
    expect(state).toContain("'D_AI_CORRUPT_STATE'")
  })

  it('keeps domain tool adapters outside domain state and orchestration modules', async () => {
    const domainCore = [
      'state.ts',
      'scientific-state.ts',
      'investor-state.ts',
      'cyber-state.ts',
      'operations-state.ts',
      'innovation-state.ts',
      'orchestration.ts',
      'scientific-orchestration.ts',
      'investor-orchestration.ts',
      'cyber-orchestration.ts',
      'operations-orchestration.ts',
      'innovation-orchestration.ts',
    ]
    for (const file of domainCore) {
      const text = await source(file)
      expect(text, file).not.toContain('defineTool(')
    }
  })
})
