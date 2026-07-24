export class BodyLimitError extends Error {
  constructor() {
    super('request body exceeds the configured limit');
    this.name = 'BodyLimitError';
  }
}

export const readBoundedStream = async (
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains authoritative if cancellation races a closed stream.
        }
        throw new BodyLimitError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};
