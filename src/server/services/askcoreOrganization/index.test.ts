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

  it('syncs the Better Auth member snapshot after creating the default organization', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const db = {
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    const user = { displayName: '张扬', email: 'zy@askcore.cn', id: 'user-owner' };
    service.addMembership = vi.fn(async () => ({ created: true, id: 'mem-owner' }));
    service.getOrganization = vi.fn(async (organizationId: string) => ({
      id: organizationId,
      logo: null,
      name: '张扬 的组织',
      slug: 'askcore-test',
    }));
    service.membersForOrganization = vi.fn(async () => [
      {
        createdAt: '2026-06-30T00:00:00.000Z',
        email: 'zy@askcore.cn',
        id: 'mem-owner',
        name: '张扬',
        role: 'owner',
        userId: 'user-owner',
      },
    ]);
    service.postWorkbenchOrganizationJson = vi.fn(async () => ({}));

    const organizationId = await service.createDefaultOrganization(user);

    expect(service.postWorkbenchOrganizationJson).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          members: [
            {
              created_at: '2026-06-30T00:00:00.000Z',
              email: 'zy@askcore.cn',
              member_id: 'mem-owner',
              name: '张扬',
              role: 'owner',
              user_id: 'user-owner',
            },
          ],
          organization: {
            id: organizationId,
            logo: null,
            name: '张扬 的组织',
            slug: 'askcore-test',
          },
        },
        organizationId,
        organizationRole: 'owner',
        path: 'member-source/sync',
        user,
      }),
    );
  });

  it('syncs the Better Auth member snapshot after manually creating an organization', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const db = {
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    const session = { user: { email: 'owner@askcore.cn', id: 'user-owner', name: 'Owner' } };
    service.addMembership = vi.fn(async () => ({ created: true, id: 'mem-owner' }));
    service.setActiveOrganizationForSession = vi.fn(async () => undefined);
    service.payloadForUser = vi.fn(async () => ({ current: null, members: [], organizations: [] }));
    service.getOrganization = vi.fn(async (organizationId: string) => ({
      id: organizationId,
      logo: null,
      name: '试点区',
      slug: 'askcore-test',
    }));
    service.membersForOrganization = vi.fn(async () => [
      {
        email: 'owner@askcore.cn',
        id: 'mem-owner',
        name: 'Owner',
        role: 'owner',
        userId: 'user-owner',
      },
    ]);
    service.postWorkbenchOrganizationJson = vi.fn(async () => ({}));

    await service.createOrganization(session, { name: '试点区' });

    expect(service.postWorkbenchOrganizationJson).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          members: [
            {
              created_at: undefined,
              email: 'owner@askcore.cn',
              member_id: 'mem-owner',
              name: 'Owner',
              role: 'owner',
              user_id: 'user-owner',
            },
          ],
          organization: expect.objectContaining({ name: '试点区' }),
        }),
        organizationRole: 'owner',
        path: 'member-source/sync',
      }),
    );
  });

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

  it('defaults active organization contact to the organization owner', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const service = new AskCoreOrganizationService({ db: {} as never }) as any;
    service.listOrganizationsForUser = vi.fn(async () => [
      {
        id: 'org-1',
        isActive: false,
        name: '试点区',
        role: 'owner',
        slug: 'pilot',
      },
    ]);
    service.membersForOrganization = vi.fn(async () => [
      {
        email: 'zy@askcore.cn',
        id: 'mem-owner',
        name: '张扬',
        role: 'owner',
        userId: 'user-owner',
      },
    ]);
    service.persistedActiveOrganizationId = vi.fn(async () => undefined);

    const payload = await service.payloadForUser(
      { email: 'zy@askcore.cn', id: 'user-owner' },
      'org-1',
    );

    expect(payload.current?.contact).toBe('张扬');
    expect(payload.organizations[0]?.contact).toBe('张扬');
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
    service.syncOrganizationMemberSource = vi.fn(async () => undefined);
    const user = { displayName: '新学生', email: 'student@askcore.cn', id: 'user-student' };

    await expect(service.acceptInvite(user, 'raw-token')).resolves.toBe('org-1');
    expect(service.acceptDirectoryInvitation).toHaveBeenCalledWith({
      directoryInvitationToken: 'dir-token',
      organizationId: 'org-1',
      user,
    });
    expect(service.syncOrganizationMemberSource).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationRole: 'member',
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

  it('syncs the Better Auth member snapshot after updating a member role', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const updateWhere = vi.fn(async () => undefined);
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    const session = { user: { email: 'owner@askcore.cn', id: 'user-owner', name: 'Owner' } };
    service.requireAdmin = vi.fn(async () => ({ role: 'owner' }));
    service.getMember = vi.fn(async () => ({ id: 'mem-target', role: 'member' }));
    service.membersForOrganization = vi.fn(async () => []);
    service.syncOrganizationMemberSource = vi.fn(async () => undefined);

    await service.updateMemberRole(session, 'org-1', 'mem-target', 'admin');

    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(service.syncOrganizationMemberSource).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationRole: 'owner',
      user: expect.objectContaining({ id: 'user-owner' }),
    });
  });

  it('syncs the Better Auth member snapshot after removing a member', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const deleteWhere = vi.fn(async () => undefined);
    const db = {
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    const session = { user: { email: 'owner@askcore.cn', id: 'user-owner', name: 'Owner' } };
    service.requireAdmin = vi.fn(async () => ({ role: 'owner' }));
    service.getMember = vi.fn(async () => ({ id: 'mem-target', role: 'member' }));
    service.membersForOrganization = vi.fn(async () => []);
    service.syncOrganizationMemberSource = vi.fn(async () => undefined);

    await service.removeMember(session, 'org-1', 'mem-target');

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(service.syncOrganizationMemberSource).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationRole: 'owner',
      user: expect.objectContaining({ id: 'user-owner' }),
    });
  });

  it('rejects admin removal of owner or admin members', async () => {
    const { AskCoreOrganizationService } = await import('./index');
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    };
    const service = new AskCoreOrganizationService({ db: db as never }) as any;
    const session = { user: { email: 'admin@askcore.cn', id: 'user-admin', name: 'Admin' } };
    service.requireAdmin = vi.fn(async () => ({ role: 'admin' }));
    service.getMember = vi.fn(async () => ({ id: 'mem-target', role: 'admin' }));

    await expect(service.removeMember(session, 'org-1', 'mem-target')).rejects.toMatchObject({
      message: 'Only owners can remove owner or admin membership',
      status: 403,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
