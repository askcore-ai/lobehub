import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/services/email', () => ({
  EmailService: vi.fn(() => {
    throw new Error('SMTP is required');
  }),
}));

describe('AskCoreOrganizationService', () => {
  it('does not require SMTP settings for read-only organization operations', async () => {
    const { AskCoreOrganizationService } = await import('./index');

    expect(() => new AskCoreOrganizationService({ db: {} as never })).not.toThrow();
  }, 20_000);

  it('does not persist a first organization for multi-organization sessions without an active organization', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const service = new AskCoreOrganizationService({ db: {} as never }) as any;
    const organizations = [
      {
        id: 'org-1',
        isActive: false,
        name: 'First School',
        role: 'owner',
        slug: 'first',
      },
      {
        id: 'org-2',
        isActive: false,
        name: 'Second School',
        role: 'admin',
        slug: 'second',
      },
    ];

    service.listOrganizationsForUser = vi.fn(async () => organizations);
    service.membersForOrganization = vi.fn(async () => []);
    service.persistedActiveOrganizationId = vi.fn(async () => undefined);
    service.setActiveOrganizationForSession = vi.fn(async () => undefined);

    const payload = await service.bootstrap({
      session: { id: 'session-1' },
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    });

    expect(service.setActiveOrganizationForSession).not.toHaveBeenCalled();
    expect(payload.current).toBeNull();
    expect(payload.organizations).toEqual(
      organizations.map((item) => ({ ...item, isActive: false })),
    );
  });

  it('rejects organization invites without an education directory preset', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const service = new AskCoreOrganizationService({ db: {} as never }) as any;
    service.requireAdmin = vi.fn(async () => ({ role: 'owner' }));
    service.getOrganization = vi.fn(async () => ({ name: '试点区' }));

    await expect(
      service.createInvite(
        { session: { id: 'session-1' }, user: { email: 'admin@askcore.cn', id: 'user-admin' } },
        'org-1',
        { channel: 'link', expiresIn: '7d', role: 'member' },
      ),
    ).rejects.toMatchObject({
      message: 'Directory invitation token is required',
      status: 400,
    });
  });

  it('rejects legacy organization invite tokens that are missing education identity binding', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                email: null,
                expiresAt: new Date(Date.now() + 60_000),
                id: 'orginv-legacy',
                organizationId: 'org-1',
                revokedAt: null,
                role: 'member',
              },
            ]),
          })),
        })),
      })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;

    await expect(
      service.acceptInvite(
        { displayName: '新成员', email: 'new@askcore.cn', id: 'user-new' },
        'raw-token',
      ),
    ).rejects.toMatchObject({
      message: 'Invitation is missing education identity preset',
      status: 400,
    });
  });

  it('accepts directory-backed organization invites and rolls back new membership on directory failure', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const updateWhere = vi.fn(async () => undefined);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                directoryInvitationToken: 'dir-token',
                email: null,
                expiresAt: new Date(Date.now() + 60_000),
                id: 'orginv-dir',
                organizationId: 'org-1',
                primaryOrgUnitId: 10004,
                revokedAt: null,
                role: 'member',
                rosterKind: 'student',
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    service.getOrganization = vi.fn(async () => ({ id: 'org-1', name: '试点区' }));
    service.addMembership = vi.fn(async () => ({ created: true, id: 'mem-1' }));
    service.removeMembershipRecord = vi.fn(async () => undefined);
    service.acceptDirectoryInvitation = vi.fn(async () => undefined);
    const user = { displayName: '新学生', email: 'student@askcore.cn', id: 'user-student' };

    await expect(service.acceptInvite(user, 'raw-token')).resolves.toBe('org-1');
    expect(service.acceptDirectoryInvitation).toHaveBeenCalledWith({
      directoryInvitationToken: 'dir-token',
      organizationId: 'org-1',
      user,
    });
    expect(updateWhere).toHaveBeenCalledTimes(1);

    service.acceptDirectoryInvitation = vi.fn(async () => {
      throw new Error('directory binding failed');
    });
    await expect(service.acceptInvite(user, 'raw-token')).rejects.toThrow(
      'directory binding failed',
    );
    expect(service.removeMembershipRecord).toHaveBeenCalledWith('mem-1');
  });
});
