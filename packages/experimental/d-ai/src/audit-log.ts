/** Append-only auditable hash chain for D_AI control-plane events. */
import { createHash } from 'node:crypto'
import type { SystemId } from './systems.ts'

export type AuditAction =
  | 'MISSION_CREATE'
  | 'TASK_TRANSITION'
  | 'CAPABILITY_GRANT'
  | 'CAPABILITY_DENY'
  | 'CROSS_SYSTEM_HANDOFF'
  | 'MODEL_ROUTE'
  | 'TRAINING_DATA_DECISION'
  | 'HUMAN_APPROVAL'
  | 'TOOL_EXECUTION'

export interface AuditEventInput {
  readonly id: string
  readonly at: string
  readonly actorId: string
  readonly action: AuditAction
  readonly systemId?: SystemId | undefined
  readonly missionId?: string | undefined
  readonly taskId?: string | undefined
  readonly subjectId?: string | undefined
  readonly details: Readonly<Record<string, string | number | boolean | null>>
}

export interface AuditRecord extends AuditEventInput {
  readonly sequence: number
  readonly previousHash: string
  readonly hash: string
}

export interface AuditChain {
  readonly records: readonly AuditRecord[]
  readonly headHash: string
}

const GENESIS_HASH = '0'.repeat(64)

function validTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid audit timestamp: ${value}`)
}

function stableDetails(details: AuditEventInput['details']): string {
  const entries = Object.entries(details).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(Object.fromEntries(entries))
}

function computeHash(record: Omit<AuditRecord, 'hash'>): string {
  const payload = [
    record.sequence,
    record.previousHash,
    record.id,
    record.at,
    record.actorId,
    record.action,
    record.systemId ?? '',
    record.missionId ?? '',
    record.taskId ?? '',
    record.subjectId ?? '',
    stableDetails(record.details),
  ].join('\u001f')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export function createAuditChain(): AuditChain {
  return Object.freeze({ records: Object.freeze([]), headHash: GENESIS_HASH })
}

export function appendAuditRecord(chain: AuditChain, input: AuditEventInput): AuditChain {
  if (input.id.trim().length === 0 || input.actorId.trim().length === 0) throw new Error('Audit id and actor are required')
  validTimestamp(input.at)
  if (chain.records.some(record => record.id === input.id)) throw new Error(`Duplicate audit id: ${input.id}`)

  const base: Omit<AuditRecord, 'hash'> = Object.freeze({
    ...input,
    details: Object.freeze({ ...input.details }),
    sequence: chain.records.length + 1,
    previousHash: chain.headHash,
  })
  const record: AuditRecord = Object.freeze({ ...base, hash: computeHash(base) })
  return Object.freeze({
    records: Object.freeze([...chain.records, record]),
    headHash: record.hash,
  })
}

export function verifyAuditChain(chain: AuditChain): boolean {
  let previousHash = GENESIS_HASH
  for (let index = 0; index < chain.records.length; index += 1) {
    const record = chain.records[index]!
    if (record.sequence !== index + 1 || record.previousHash !== previousHash) return false
    const { hash, ...base } = record
    if (computeHash(base) !== hash) return false
    previousHash = hash
  }
  return previousHash === chain.headHash
}
