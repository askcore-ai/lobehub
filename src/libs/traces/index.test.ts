// @vitest-environment node
import { Langfuse } from 'langfuse';
import { CreateLangfuseTraceBody } from 'langfuse-core';
import { describe, expect, it, vi } from 'vitest';

import * as server from '@/envs/langfuse';

import { TraceClient } from './index';

describe('TraceClient', () => {
  it('should not initialize Langfuse client when keys are missing', () => {
    vi.spyOn(server, 'getLangfuseConfig').mockReturnValue({
      LANGFUSE_PUBLIC_KEY: '',
      LANGFUSE_SECRET_KEY: '',
      LANGFUSE_HOST: 'http://localhost:13000',
    } as any);
    const client = new TraceClient();
    expect(client['_client']).toBeUndefined();
  });

  it('should not throw if LANGFUSE keys are missing', () => {
    vi.spyOn(server, 'getLangfuseConfig').mockReturnValue({
      LANGFUSE_PUBLIC_KEY: '',
      LANGFUSE_SECRET_KEY: '',
      LANGFUSE_HOST: 'http://localhost:13000',
    } as any);
    expect(() => new TraceClient()).not.toThrow();
  });

  it('should call trace method of Langfuse client', () => {
    const mockTrace = vi.fn();

    vi.spyOn(Langfuse.prototype, 'trace').mockImplementation(mockTrace);

    vi.spyOn(server, 'getLangfuseConfig').mockReturnValue({
      LANGFUSE_PUBLIC_KEY: 'public-key',
      LANGFUSE_SECRET_KEY: 'secret-key',
      LANGFUSE_HOST: 'host',
    } as any);

    const client = new TraceClient();
    const traceParam: CreateLangfuseTraceBody = { id: 'abc' };
    client.createTrace(traceParam);

    expect(mockTrace).toHaveBeenCalledWith(traceParam);
  });

  it('should call shutdownAsync method of Langfuse client', async () => {
    const mockShutdownAsync = vi.fn();

    vi.spyOn(Langfuse.prototype, 'shutdownAsync').mockImplementation(mockShutdownAsync);
    vi.spyOn(server, 'getLangfuseConfig').mockReturnValue({
      LANGFUSE_PUBLIC_KEY: 'public-key',
      LANGFUSE_SECRET_KEY: 'secret-key',
      LANGFUSE_HOST: 'host',
    } as any);

    const client = new TraceClient();
    await client.shutdownAsync();

    expect(mockShutdownAsync).toHaveBeenCalled();
  });
});
