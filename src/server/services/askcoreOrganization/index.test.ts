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
});
