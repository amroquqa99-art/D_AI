/** Immutable experiment manifests stored beside native content-addressed files. */
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createHash } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/).transform(AttachmentId)
const file = z.object({
  attachmentId: digest,
  name: z.string().min(1).max(255),
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()

/** Metadata admitted from a tool or an experiment producer. */
export const artifactMetadataSchema = z.object({
  title: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().min(1).max(160),
  parents: z.array(digest).max(32).default([]),
}).strict().refine(value => new Set(value.parents).size === value.parents.length, 'duplicate artifact parent')

const document = z.object({
  format: z.literal('d_ai.artifact.v1'),
  ownerSessionId: z.string().min(1).transform(SessionId),
  title: z.string().min(1).max(240),
  mediaType: z.string().min(1).max(160),
  content: file,
  parents: z.array(digest).max(32),
}).strict()

/** Receipt for an immutable manifest and its exact content reference. */
export const artifactRecordSchema = z.object({ manifest: file, document }).strict()

/** Version-one manifest receipt referencing native immutable attachment objects. */
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>

/** Validated experiment metadata without a caller-supplied owner identity. */
export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>

/** Durable owner-scoped catalog; a published receipt never overwrites another manifest. */
export const artifactCatalogSpec = defineDomain({
  name: 'd_ai_artifact_catalog',
  version: 1,
  layout: 'single',
  tables: { artifacts: domainTable(artifactRecordSchema) },
})

/**
 * Address one owner's manifest without interpreting either identity as a path.
 * @param owner - native root Session identity.
 * @param id - content-addressed manifest identity.
 * @returns the exact catalog key.
 */
export function artifactCatalogKey(owner: SessionId, id: AttachmentId): string {
  return createHash('sha256').update(JSON.stringify([owner, id])).digest('hex')
}
