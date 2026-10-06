import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Raise one stable D_AI runtime error at a policy/application boundary. */
export function failDai(message: string, code = 'D_AI_POLICY_DENIED'): never {
  throw new HarnessError(message, code)
}
