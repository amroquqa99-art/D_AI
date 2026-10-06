import { HarnessError, isHarnessError } from '@deepseek-ai/dsh-llm'

/** Raise one stable D_AI runtime error at a policy/application boundary. */
export function failDai(message: string, code = 'D_AI_POLICY_DENIED'): never {
  throw new HarnessError(message, code)
}

/** Route caught runtime failures by stable HarnessError code, never by message text. */
export function hasDaiErrorCode(error: unknown, code: string): boolean {
  return isHarnessError(error) && error.code === code
}
