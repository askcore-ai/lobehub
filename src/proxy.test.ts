import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('proxy matcher', () => {
  it('routes AskCore first-party deep links through the SPA middleware', async () => {
    const source = await readFile(path.join(process.cwd(), 'src/proxy.ts'), 'utf8');

    expect(source).toContain("'/askcore'");
    expect(source).toContain("'/askcore(.*)'");
    expect(source).toContain("'/school'");
    expect(source).toContain("'/school/learning-space'");
    expect(source).toContain("'/school/operations-center'");
    expect(source).toContain("'/school/teaching-center'");
    expect(source).not.toContain("'/school(.*)'");
    expect(source).not.toContain("'/organization'");
    expect(source).not.toContain("'/organization(.*)'");
    expect(source).not.toContain("'/join/organization(.*)'");
  });

  it('leaves only public LMS protocol ingress outside Better Auth middleware', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src/libs/next/proxy/define-config.ts'),
      'utf8',
    );
    const publicRoutes = source.slice(
      source.indexOf('const isPublicRoute'),
      source.indexOf('const betterAuthMiddleware'),
    );

    expect(publicRoutes).toContain("'/api/askcore/lti/jwks'");
    expect(publicRoutes).toContain("'/api/askcore/lti/launch(.*)'");
    expect(publicRoutes).toContain("'/api/lms-connectors(.*)'");
    expect(publicRoutes).toContain("'/oidc/.well-known/(.*)'");
    expect(publicRoutes).toContain("'/oidc/jwks'");
    expect(publicRoutes).toContain("'/oidc/me'");
    expect(publicRoutes).not.toContain('/api/askcore/lti/processing');
    expect(publicRoutes).not.toContain('/api/askcore/lti/identity-links');
  });
});
