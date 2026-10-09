/** Opt-in experiment artifacts through native attachment and storage providers. */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { createHash } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AttachmentId, FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { artifactCatalogKey, artifactCatalogSpec, artifactMetadataSchema } from './artifact-record.ts'
import type { ArtifactMetadata, ArtifactRecord } from './artifact-record.ts'
import { DaiRuntimeKernel } from './runtime-kernel.ts'
import { immutableSnapshot } from './runtime-state.ts'
import { failDai } from './runtime-errors.ts'
import { registerArtifactTools } from './artifact-tools.ts'

export type { ArtifactMetadata, ArtifactRecord } from './artifact-record.ts'

/** Deployment limits apply before byte storage and complete tool-result publication. */
export interface Config {
  /** Maximum bytes retained for one artifact, including host API uploads. */
  maxArtifactBytes?: number
  /** Maximum bytes for one immutable manifest. */
  maxManifestBytes?: number
  /** Maximum manifests admitted per root owner; duplicate receipts use no new slot. */
  maxArtifactsPerOwner?: number
  /** Maximum UTF-8 bytes for a complete JSON tool-result envelope. */
  maxToolResultBytes?: number
}

const defaults = { maxArtifactBytes: 1048576, maxManifestBytes: 16384, maxArtifactsPerOwner: 1000, maxToolResultBytes: 2097152 }

/** Validated limits for the optional artifact-store plugin. */
export const Config: schema<Config> = schema.object({
  maxArtifactBytes: schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.maxArtifactBytes),
  maxManifestBytes: schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.maxManifestBytes),
  maxArtifactsPerOwner: schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.maxArtifactsPerOwner),
  maxToolResultBytes: schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.maxToolResultBytes),
})

declare module '@deepseek-ai/cordis' {
  interface Context { daiArtifacts: ArtifactStore }
}

/**
 * Owner-scoped immutable artifacts. Native providers publish bytes before the
 * catalog receipt; interrupted writes may leave unreachable immutable files.
 * Mutations require a live root and an open native turn; reads never upload data.
 */
export class ArtifactStore extends Service {
  static inject = ['agents', 'attachments', 'storageDomain', 'tools']
  static Config = Config
  private readonly kernel: DaiRuntimeKernel
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly catalog: Promise<Domain<typeof artifactCatalogSpec>>
  private readonly limits: Required<Config>

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'daiArtifacts')
    const validated = Config(config)
    this.limits = {
      maxArtifactBytes: validated.maxArtifactBytes ?? defaults.maxArtifactBytes,
      maxManifestBytes: validated.maxManifestBytes ?? defaults.maxManifestBytes,
      maxArtifactsPerOwner: validated.maxArtifactsPerOwner ?? defaults.maxArtifactsPerOwner,
      maxToolResultBytes: validated.maxToolResultBytes ?? defaults.maxToolResultBytes,
    }
    this.kernel = new DaiRuntimeKernel(ctx)
    this.catalog = ctx.storageDomain.open(artifactCatalogSpec).then(async (catalog) => {
      for (const [key, record] of catalog.table('artifacts').entries()) {
        if (key !== artifactCatalogKey(record.document.ownerSessionId, record.manifest.attachmentId)) {
          await catalog.close()
          failDai('artifact catalog key does not match its receipt', 'D_AI_ARTIFACT_CORRUPT')
        }
      }
      return catalog
    })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('D_AI artifact store disposed'))
      await Promise.allSettled([...this.pending])
      await (await this.catalog).close()
    }, 'dai.artifacts()')
    registerArtifactTools(ctx, this, this.limits)
  }

  async [Service.init](): Promise<void> { await this.catalog }

  private async run<T>(agent: Agent, signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.kernel.authorizeOwner(agent)
    const combined = signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal])
    combined.throwIfAborted()
    const result = operation(combined)
    this.pending.add(result)
    try { return await result } finally { this.pending.delete(result) }
  }

  private async record(agent: Agent, id: AttachmentId): Promise<ArtifactRecord> {
    const value = (await this.catalog).table('artifacts').get(artifactCatalogKey(agent.id, id))
    if (value === undefined) failDai('artifact is absent or not owned by this root', 'D_AI_ARTIFACT_NOT_FOUND')
    return value
  }

  private async bytes(ref: FileAttachmentRef, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
    if (ref.bytes > maxBytes) failDai('stored artifact exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
    const chunks: Uint8Array[] = []
    let length = 0
    for await (const chunk of this.ctx.attachments.readFileStream(ref, signal)) {
      signal.throwIfAborted()
      length += chunk.byteLength
      if (length > maxBytes || length > ref.bytes) failDai('artifact stream exceeds its receipt or byte limit', 'D_AI_ARTIFACT_LIMIT')
      chunks.push(chunk)
    }
    signal.throwIfAborted()
    if (length !== ref.bytes) failDai('artifact stream is shorter than its receipt', 'D_AI_ARTIFACT_CORRUPT')
    return Buffer.concat(chunks, length)
  }

  /**
   * Publish bytes and an immutable lineage manifest inside an owner turn.
   * @param agent - exact live root owner.
   * @param input - validated metadata and exact content bytes.
   * @param signal - optional cancellation; a canceled save may leave unreachable files.
   * @returns a durable detached receipt after catalog publication.
   */
  async put(agent: Agent, input: ArtifactMetadata & { data: Uint8Array }, signal?: AbortSignal): Promise<ArtifactRecord> {
    return this.run(agent, signal, cancellation => this.kernel.transact(agent, async () => {
      this.kernel.requireOpenTurn(agent)
      cancellation.throwIfAborted()
      const metadata = artifactMetadataSchema.parse({ title: input.title, mediaType: input.mediaType, parents: input.parents })
      if (input.data.byteLength > this.limits.maxArtifactBytes) failDai('artifact exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
      const table = (await this.catalog).table('artifacts')
      const owned = [...table.entries()].map(([, item]) => item).filter(item => item.document.ownerSessionId === agent.id)
      if (owned.length >= this.limits.maxArtifactsPerOwner) {
        const contentId = 'sha256:' + createHash('sha256').update(input.data).digest('hex')
        const duplicate = owned.some(item => item.document.content.attachmentId === contentId
          && item.document.title === metadata.title && item.document.mediaType === metadata.mediaType
          && JSON.stringify(item.document.parents) === JSON.stringify(metadata.parents))
        if (!duplicate) failDai('artifact owner catalog is full', 'D_AI_ARTIFACT_LIMIT')
      }
      for (const parent of metadata.parents) await this.record(agent, parent)
      const content = await this.ctx.attachments.saveFile({ data: input.data, name: 'artifact' })
      cancellation.throwIfAborted()
      const document: ArtifactRecord['document'] = {
        format: 'd_ai.artifact.v1', ownerSessionId: agent.id,
        title: metadata.title, mediaType: metadata.mediaType, content, parents: metadata.parents,
      }
      const encoded = Buffer.from(JSON.stringify(document))
      if (encoded.byteLength > this.limits.maxManifestBytes) failDai('artifact manifest exceeds the configured byte limit', 'D_AI_ARTIFACT_LIMIT')
      const manifest = await this.ctx.attachments.saveFile({ data: encoded, name: 'manifest.json' })
      cancellation.throwIfAborted()
      const key = artifactCatalogKey(agent.id, manifest.attachmentId)
      const prior = table.get(key)
      if (prior !== undefined) return immutableSnapshot(prior)
      if (owned.length >= this.limits.maxArtifactsPerOwner) failDai('artifact provider returned a different manifest for a duplicate', 'D_AI_ARTIFACT_CORRUPT')
      this.kernel.requireOpenTurn(agent)
      cancellation.throwIfAborted()
      const receipt = { manifest, document }
      await table.put(key, receipt)
      return immutableSnapshot(receipt)
    }))
  }

  /**
   * Read exact bytes only after verifying the immutable manifest against the catalog.
   * @param agent - exact live root owner; child and foreign roots are refused.
   * @param id - manifest digest previously published to this owner.
   * @param signal - optional cancellation of storage reads.
   * @returns detached metadata and verified content bytes.
   */
  async read(agent: Agent, id: AttachmentId, signal?: AbortSignal): Promise<{ record: ArtifactRecord; data: Uint8Array }> {
    return this.run(agent, signal, async (cancellation) => {
      const record = await this.record(agent, id)
      const manifest = await this.bytes(record.manifest, this.limits.maxManifestBytes, cancellation)
      if (!Buffer.from(manifest).equals(Buffer.from(JSON.stringify(record.document)))) {
        failDai('artifact manifest does not match its catalog receipt', 'D_AI_ARTIFACT_CORRUPT')
      }
      const data = await this.bytes(record.document.content, this.limits.maxArtifactBytes, cancellation)
      return { record: immutableSnapshot(record), data }
    })
  }

  /**
   * List this live root's catalog metadata without reading or disclosing other owners' bytes.
   * @param agent - exact live root owner.
   * @returns detached immutable receipts in stable digest order.
   */
  async list(agent: Agent): Promise<readonly ArtifactRecord[]> {
    return this.run(agent, undefined, async (signal) => {
      const catalog = await this.catalog
      signal.throwIfAborted()
      return immutableSnapshot([...catalog.table('artifacts').entries()]
        .map(([, record]) => record).filter(record => record.document.ownerSessionId === agent.id)
        .sort((left, right) => left.manifest.attachmentId.localeCompare(right.manifest.attachmentId)))
    })
  }
}

export default ArtifactStore
