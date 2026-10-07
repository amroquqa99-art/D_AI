/** Promptfoo grades native recordings; this provider performs no model calls. */
import { decisionCases, gradeDecisionRow, readDecisionReceipt } from './local-decision-evaluation.ts'

export default class NativeDecisionReplay {
  private readonly receipt

  constructor(_options: unknown, path = process.env.D_AI_EVAL_RECEIPT) {
    if (!path) throw new Error('Set D_AI_EVAL_RECEIPT to a completed native decision receipt')
    this.receipt = readDecisionReceipt(path)
  }

  id() { return 'd-ai-native-decision-replay' }

  async callApi(_prompt: string, context: { vars?: { caseId?: string } }) {
    const test = decisionCases.find(test => test.vars.caseId === context.vars?.caseId)
    const row = this.receipt.outcomes.find(row => row.caseId === context.vars?.caseId)
    if (!test || !row) return { error: 'Unknown native decision case' }
    const grade = gradeDecisionRow(row, test.vars)
    // Promptfoo's replay latency is unrelated to the recorded inference time.
    return { output: JSON.stringify(grade), metadata: { nativeAdviceElapsedMs: row.elapsedMs, usage: row.usage } }
  }
}
