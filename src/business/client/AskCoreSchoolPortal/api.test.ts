// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSchoolBillingSourceProof,
  fetchSchoolPortalManifest,
  stableSchoolSessionGeneration,
} from './api';
import { setSchoolHandoffSessionState } from './handoffClient';

describe('school portal manifest sanitizer', () => {
  afterEach(() => {
    setSchoolHandoffSessionState('signed-out', null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['conflict', 'unavailable'] as const)(
    'preserves the source presentation %s state',
    async (state) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            can_manage_integrations: false,
            contract: 'askcore.native-school-shell.v1',
            schools: [],
            selection_required: false,
            show_school_entry: true,
            state,
          }),
        ),
      );

      await expect(fetchSchoolPortalManifest()).resolves.toEqual({
        can_manage_integrations: false,
        contract: 'askcore.native-school-shell.v1',
        schools: [],
        selection_required: false,
        show_school_entry: true,
        state,
      });
    },
  );

  it('rejects a conflict response that smuggles a fallback school', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          can_manage_integrations: false,
          contract: 'askcore.native-school-shell.v1',
          schools: [{ key: 'fallback', name: 'Unsafe fallback' }],
          selection_required: false,
          show_school_entry: true,
          state: 'conflict',
        }),
      ),
    );

    await expect(fetchSchoolPortalManifest()).rejects.toMatchObject({ status: 502 });
  });

  it('invalidates the school generation while Better Auth is refetching', () => {
    const staleSession = {
      session: { id: 'session-a' },
      user: { id: 'account-a' },
    };

    expect(
      stableSchoolSessionGeneration(staleSession, {
        isPending: false,
        isRefetching: true,
      }),
    ).toBeUndefined();
    expect(
      stableSchoolSessionGeneration(staleSession, {
        isPending: false,
        isRefetching: false,
      }),
    ).toBe('account-a:session-a');
  });

  it('aligns Gibbon once and retries a direct school-plan proof after 401', async () => {
    const sourceProof = 'proof.header.signature';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'rejected' }, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          action: '/school/services/askcore/handoff.php',
          grant: 'grant.header.signature',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 303 }))
      .mockResolvedValueOnce(
        Response.json({
          expires_at: Math.floor(Date.now() / 1000) + 60,
          source_proof: sourceProof,
          status: 'succeeded',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    setSchoolHandoffSessionState('stable', 'generation-a');

    await expect(
      fetchSchoolBillingSourceProof({ schoolKey: 'askcore-pilot-school' }),
    ).resolves.toMatchObject({ source_proof: sourceProof });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/askcore/school/handoff',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/school/services/askcore/handoff.php',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it.each([403, 503])('does not align or retry source-proof status %s', async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: 'rejected' }, { status }));
    vi.stubGlobal('fetch', fetchMock);
    setSchoolHandoffSessionState('stable', 'generation-a');

    await expect(
      fetchSchoolBillingSourceProof({ schoolKey: 'askcore-pilot-school' }),
    ).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
