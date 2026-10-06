import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { failDai } from './runtime-errors.ts'

/**
 * Shared runtime invariants that must be identical across every D_AI domain.
 *
 * The kernel deliberately does not know domain state. It owns only identity,
 * mutation ordering and native-turn requirements so domain services cannot
 * accidentally implement those invariants differently.
 */
export class DaiRuntimeKernel {
  private readonly tails = new Map<string, Promise<void>>()

  constructor(private readonly ctx: Context) {}

  authorizeOwner(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent || !this.ctx.agents.roots().includes(agent)) {
      failDai('operation requires the exact live owner root Agent')
    }
  }

  requireOpenTurn(agent: Agent): number {
    this.authorizeOwner(agent)
    const events = agent.session.snapshotEvents()
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.type === 'turn/end') break
      if (events[index]?.type === 'turn/start') return index
    }
    return failDai('D_AI mutations require an open native Agent turn')
  }

  async transact<T>(agent: Agent, operation: () => Promise<T>): Promise<T> {
    this.authorizeOwner(agent)
    const prior = this.tails.get(agent.id) ?? Promise.resolve()
    const run = prior.then(operation, operation)
    const tail = run.then(() => undefined, () => undefined)
    this.tails.set(agent.id, tail)

    try {
      return await run
    } finally {
      if (this.tails.get(agent.id) === tail) this.tails.delete(agent.id)
    }
  }

  async drain(): Promise<void> {
    await Promise.all([...this.tails.values()])
  }
}
