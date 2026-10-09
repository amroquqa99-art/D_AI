/** Bounded portable artifact receipts; archives retain the original native owner. */
import { createHash } from 'node:crypto'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { artifactRecordSchema } from './artifact-record.ts'
import type { ArtifactRecord } from './artifact-record.ts'
import { failDai } from './runtime-errors.ts'

/** Portable version-one wire boundary, separate from native Session formats. */
export const artifactArchiveSchema = z.object({
  format: z.literal('d_ai.artifact.archive.v1'),
  ownerSessionId: z.string().min(1),
  records: z.array(artifactRecordSchema),
  contents: z.array(z.object({
    attachmentId: z.string().regex(/^sha256:[a-f0-9]{64}$/).transform(AttachmentId),
    base64: z.string(),
  }).strict()),
}).strict()

/** Byte and catalog bounds shared by archive admission and export. */
export interface ArchiveLimits {
  maxArchiveBytes: number
  maxArtifactBytes: number
  maxManifestBytes: number
  maxArtifactsPerOwner: number
}

/**
 * Validate the complete untrusted archive before any provider writes.
 * @param input - exact UTF-8 archive bytes.
 * @param owner - authorized destination Session, retaining its original identity.
 * @param limits - resolved deployment bounds.
 * @returns detached receipts in parent-first order and verified content bytes.
 */
export function decodeArtifactArchive(input: Uint8Array, owner: SessionId, limits: ArchiveLimits): {
  records: ArtifactRecord[]
  contents: Map<AttachmentId, Uint8Array>
} {
  if (input.byteLength > limits.maxArchiveBytes) failDai('artifact archive exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
  const archive = artifactArchiveSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input)))
  if (archive.ownerSessionId !== owner || archive.records.some(record => record.document.ownerSessionId !== owner)) {
    failDai('artifact archive belongs to a different root', 'D_AI_POLICY_DENIED')
  }
  if (archive.records.length > limits.maxArtifactsPerOwner || archive.contents.length > archive.records.length) {
    failDai('artifact archive exceeds the configured catalog limit', 'D_AI_ARTIFACT_LIMIT')
  }
  const contents = new Map<AttachmentId, Uint8Array>()
  for (const item of archive.contents) {
    if (item.base64.length > 4 * Math.ceil(limits.maxArtifactBytes / 3)) failDai('archive content exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
    const data = Buffer.from(item.base64, 'base64')
    if (data.byteLength > limits.maxArtifactBytes) failDai('archive content exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
    if (data.toString('base64') !== item.base64 || digest(data) !== item.attachmentId || contents.has(item.attachmentId)) {
      failDai('archive content encoding, digest or identity is invalid', 'D_AI_ARTIFACT_CORRUPT')
    }
    contents.set(item.attachmentId, data)
  }
  const records = new Map<AttachmentId, ArtifactRecord>()
  const used = new Set<AttachmentId>()
  for (const record of archive.records) {
    const manifest = Buffer.from(JSON.stringify(record.document))
    if (manifest.byteLength > limits.maxManifestBytes) failDai('archive manifest exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
    const data = contents.get(record.document.content.attachmentId)
    if (record.manifest.name !== 'manifest.json' || record.document.content.name !== 'artifact'
      || record.document.title.trim() !== record.document.title || record.document.mediaType.trim() !== record.document.mediaType
      || record.manifest.bytes !== manifest.byteLength || record.manifest.attachmentId !== digest(manifest)
      || data === undefined || record.document.content.bytes !== data.byteLength
      || records.has(record.manifest.attachmentId)
      || new Set(record.document.parents).size !== record.document.parents.length) {
      failDai('archive receipt does not match its immutable bytes', 'D_AI_ARTIFACT_CORRUPT')
    }
    records.set(record.manifest.attachmentId, record)
    used.add(record.document.content.attachmentId)
  }
  if (used.size !== contents.size) failDai('archive contains unreferenced bytes', 'D_AI_ARTIFACT_CORRUPT')
  const ordered: ArtifactRecord[] = []
  const admitted = new Set<AttachmentId>()
  while (records.size > 0) {
    const ready = [...records.values()].filter(record => record.document.parents.every(parent => admitted.has(parent)))
      .sort((left, right) => left.manifest.attachmentId.localeCompare(right.manifest.attachmentId))
    if (ready.length === 0) failDai('archive lineage has missing parents or a cycle', 'D_AI_ARTIFACT_CORRUPT')
    for (const record of ready) {
      records.delete(record.manifest.attachmentId)
      admitted.add(record.manifest.attachmentId)
      ordered.push(record)
    }
  }
  return { records: ordered, contents }
}

/**
 * Start one deterministic archive, charging the complete envelope before loading bytes.
 * @param owner - original owner identity.
 * @param records - complete owner catalog in digest order.
 * @param maxBytes - complete encoded archive byte bound.
 * @returns an encoder that charges each unique content object before retaining it.
 */
export function createArtifactArchive(owner: SessionId, records: readonly ArtifactRecord[], maxBytes: number): {
  add(id: AttachmentId, data: Uint8Array): void
  finish(): Uint8Array
} {
  const archive: z.infer<typeof artifactArchiveSchema> = { format: 'd_ai.artifact.archive.v1', ownerSessionId: owner, records: [...records], contents: [] }
  let length = Buffer.byteLength(JSON.stringify(archive))
  const ids = new Set<AttachmentId>()
  const check = () => {
    if (length > maxBytes) failDai('artifact archive exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
  }
  check()
  return {
    add(id, data) {
      if (ids.has(id)) return
      const content = { attachmentId: id, base64: Buffer.from(data).toString('base64') }
      length += Buffer.byteLength(JSON.stringify(content)) + (ids.size === 0 ? 0 : 1)
      check()
      ids.add(id)
      archive.contents.push(content)
    },
    finish() { return Buffer.from(JSON.stringify(archive)) },
  }
}

function digest(data: Uint8Array): string { return 'sha256:' + createHash('sha256').update(data).digest('hex') }
