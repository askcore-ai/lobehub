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
});
