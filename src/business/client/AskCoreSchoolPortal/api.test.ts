// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSchoolPortalManifest, stableSchoolSessionGeneration } from './api';

describe('school portal manifest sanitizer', () => {
  afterEach(() => {
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
});
