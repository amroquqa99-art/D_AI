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

    const requiredRegistrars = [
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
    for (const registrar of requiredRegistrars) {
      expect(index).toContain(registrar + '(this.ctx, this, owner')
    }
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
