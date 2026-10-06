export interface JsonToolResult {
  readonly json: string
}

/** Shared JSON envelope used by native D_AI tools. */
export const jsonToolOutput = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      json: { type: 'string' as const, required: true as const },
    },
  },
  render: (_args: unknown, value: JsonToolResult) => [
    { type: 'text' as const, text: value.json },
  ],
}

/** Serialize tool results only at the adapter boundary. */
export async function encodeToolResult(
  value: unknown | Promise<unknown>,
): Promise<JsonToolResult> {
  return { json: JSON.stringify(await value) }
}
