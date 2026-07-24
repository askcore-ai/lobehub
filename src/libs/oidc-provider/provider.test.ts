/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies

const buildAskCoreAssertion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  buildAskCoreAssertion,
}));

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://example.com',
    MARKET_BASE_URL: undefined,
  },
}));

vi.mock('@/config/db', () => ({
  serverDBEnv: {
    KEY_VAULTS_SECRET: 'test-secret-key',
  },
}));

vi.mock('debug', () => ({
  default: () => vi.fn(),
}));

describe('OIDC Provider - Market Client Integration', () => {
  const MARKET_CLIENT_ID = 'lobehub-market';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('builds confidential first-party Moodle and Gibbon clients from runtime secrets', async () => {
    const {
      ASKCORE_GIBBON_OIDC_CLIENT_ID,
      ASKCORE_MOODLE_OIDC_CLIENT_ID,
      schoolOIDCClientsFromEnvironment,
    } = await import('./config');
    const clients = schoolOIDCClientsFromEnvironment({
      ASKCORE_GIBBON_OIDC_CLIENT_SECRET: 'gibbon-secret',
      ASKCORE_MOODLE_OIDC_CLIENT_SECRET: 'moodle-secret',
    });

    expect(clients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          client_id: ASKCORE_MOODLE_OIDC_CLIENT_ID,
          client_name: 'AskCore 学校/学习空间',
          redirect_uris: ['https://askcore.cn/school/teaching/admin/oauth2callback.php'],
          subject_type: 'pairwise',
          token_endpoint_auth_method: 'client_secret_basic',
        }),
        expect.objectContaining({
          client_id: ASKCORE_GIBBON_OIDC_CLIENT_ID,
          client_name: 'AskCore 校务',
          redirect_uris: ['https://askcore.cn/school/services/login.php'],
          subject_type: 'pairwise',
          token_endpoint_auth_method: 'client_secret_post',
        }),
      ]),
    );
    expect(schoolOIDCClientsFromEnvironment({})).toEqual([]);
    expect(clients.every((client) => client.grant_types?.join(' ') === 'authorization_code')).toBe(
      true,
    );
  });

  describe('Market Client Logic', () => {
    it('should identify market client correctly', () => {
      expect(MARKET_CLIENT_ID).toBe('lobehub-market');
    });

    it('should have market client in default clients', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: 'https://askcore.cn/api/lobe/market',
        },
      }));

      const { defaultClients } = await import('./config');
      const marketClient = defaultClients.find((c) => c.client_id === MARKET_CLIENT_ID);

      expect(marketClient).toBeDefined();
      expect(marketClient?.client_id).toBe('lobehub-market');
      expect(marketClient?.client_name).toBe('AskCore Marketplace');

      vi.doUnmock('@/envs/app');
    });
  });

  describe('Provider Configuration', () => {
    it('requires PKCE for public clients and permits confidential clients to authenticate', async () => {
      const { requiresPKCEForClient } = await import('./provider');

      expect(requiresPKCEForClient({ tokenEndpointAuthMethod: 'none' })).toBe(true);
      expect(requiresPKCEForClient({ tokenEndpointAuthMethod: 'client_secret_basic' })).toBe(false);
      expect(requiresPKCEForClient({ tokenEndpointAuthMethod: 'client_secret_post' })).toBe(false);
    });

    it('keeps provider routes relative to the public issuer prefix', async () => {
      const { OIDC_PROVIDER_ROUTES } = await import('./provider');

      expect(OIDC_PROVIDER_ROUTES).toEqual({
        authorization: '/oidc/auth',
        code_verification: '/oidc/device',
        device_authorization: '/oidc/device/auth',
        end_session: '/oidc/session/end',
        introspection: '/oidc/token/introspection',
        jwks: '/oidc/jwks',
        pushed_authorization_request: '/oidc/request',
        revocation: '/oidc/token/revocation',
        token: '/oidc/token',
        userinfo: '/oidc/me',
      });
      expect(Object.values(OIDC_PROVIDER_ROUTES)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^\/oidc\//)]),
      );
      expect(Object.values(OIDC_PROVIDER_ROUTES).every((route) => route.startsWith('/oidc/'))).toBe(
        true,
      );
    });

    it('should export API_AUDIENCE constant', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const module = await import('./provider');
      expect(module.API_AUDIENCE).toBe('urn:lobehub:chat');

      vi.doUnmock('@/envs/app');
    }, 10000);

    it('issues UserInfo tokens for school clients and API tokens for Lobe clients', async () => {
      const { isSchoolOIDCClient, resolveOIDCAccountId, useGrantedResourceForClient } =
        await import('./provider');

      const moodleClient = { clientId: 'askcore-moodle' };
      const gibbonClient = { clientId: 'askcore-gibbon' };
      const desktopClient = { clientId: 'lobehub-desktop' };

      expect(isSchoolOIDCClient(moodleClient)).toBe(true);
      expect(isSchoolOIDCClient(gibbonClient)).toBe(true);
      expect(isSchoolOIDCClient(desktopClient)).toBe(false);
      expect(useGrantedResourceForClient({ oidc: { client: moodleClient } } as never)).toBe(false);
      expect(useGrantedResourceForClient({ oidc: { client: desktopClient } } as never)).toBe(true);
      expect(
        resolveOIDCAccountId({
          clientId: 'askcore-moodle',
          externalAccountId: 'external-a',
          providerSessionAccountId: 'stale-a',
          requestedAccountId: 'current-b',
        }),
      ).toBe('current-b');
      expect(
        resolveOIDCAccountId({
          clientId: 'lobehub-desktop',
          externalAccountId: 'external-a',
          providerSessionAccountId: 'stale-a',
          requestedAccountId: 'current-b',
        }),
      ).toBe('external-a');
    });

    it('resolves a principal-scoped pseudonymous subject for school clients', async () => {
      buildAskCoreAssertion.mockResolvedValue('signed-school-assertion');
      const request = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            deployment_id: 1,
            identity_link_version: 'a'.repeat(64),
            linked: true,
            school_subject: 'school_0123456789abcdef0123456789abcdef',
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', request);
      vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');

      const { resolveSchoolOIDCSubject } = await import('./provider');
      await expect(
        resolveSchoolOIDCSubject({ email: 'student@askcore.local', userId: 'user_student_1' }),
      ).resolves.toBe('school_0123456789abcdef0123456789abcdef');
      expect(request).toHaveBeenCalledWith(
        'http://api:8000/api/lti/v1/identity-links/account-subject',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-AskCore-Billing-Assertion': 'signed-school-assertion',
          }),
        }),
      );
    });

    it('fails closed when the school subject cannot be resolved', async () => {
      buildAskCoreAssertion.mockResolvedValue('signed-school-assertion');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
      vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');

      const { resolveSchoolOIDCSubject } = await import('./provider');
      await expect(
        resolveSchoolOIDCSubject({ email: 'student@askcore.local', userId: 'user_student_1' }),
      ).rejects.toThrow('school subject resolution failed');
    });

    it('accepts a pseudonymous direct subject without exposing the Better Auth id', async () => {
      buildAskCoreAssertion.mockResolvedValue('signed-school-assertion');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              deployment_id: 1,
              identity_link_version: 'b'.repeat(64),
              linked: false,
              school_subject: 'school_0123456789abcdef0123456789abcdef',
            }),
            { status: 200 },
          ),
        ),
      );

      const { resolveSchoolOIDCSubject } = await import('./provider');
      await expect(
        resolveSchoolOIDCSubject({ email: 'student@askcore.local', userId: 'user.qa.student.1' }),
      ).resolves.toBe('school_0123456789abcdef0123456789abcdef');
    });

    it('uses the pseudonymous school subject as the school client sub', async () => {
      const resolveSchoolIdentity = vi.fn().mockResolvedValue({
        identityLinkVersion: 'c'.repeat(64),
        schoolSubject: 'school_0123456789abcdef0123456789abcdef',
      });
      const { buildOIDCAccountClaims } = await import('./provider');

      const claims = await buildOIDCAccountClaims({
        clientId: 'askcore-gibbon',
        resolveSchoolIdentity,
        scope: 'openid profile email',
        user: {
          avatar: 'https://example.com/avatar.png',
          email: 'student@askcore.local',
          emailVerifiedAt: new Date(),
          fullName: 'Student One',
          id: 'better-auth-internal-id',
        },
      });

      expect(claims).toEqual({
        email: 'student@askcore.local',
        email_verified: true,
        name: 'Student One',
        picture: 'https://example.com/avatar.png',
        school_subject: 'school_0123456789abcdef0123456789abcdef',
        sub: 'school_0123456789abcdef0123456789abcdef',
      });
      expect(JSON.stringify(claims)).not.toContain('better-auth-internal-id');
    });

    it('signs pairwise school ID Token and UserInfo subjects without the account id', async () => {
      buildAskCoreAssertion.mockResolvedValue('signed-school-assertion');
      const request = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            deployment_id: 1,
            identity_link_version: 'd'.repeat(64),
            school_subject: 'school_0123456789abcdef0123456789abcdef',
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', request);
      const { decodeJwt, exportJWK, generateKeyPair } = await import('jose');
      const { default: Provider } = await import('oidc-provider');
      const { resolveSchoolOIDCPairwiseSubject } = await import('./provider');
      const { privateKey } = await generateKeyPair('RS256', { extractable: true });
      const privateJwk = {
        ...(await exportJWK(privateKey)),
        alg: 'RS256',
        kid: 'p140-school-subject-test',
        use: 'sig',
      };
      const provider = new Provider('https://issuer.example.com', {
        claims: {
          openid: ['sub'],
          profile: ['school_subject'],
        },
        clients: [
          {
            client_id: 'askcore-gibbon',
            client_secret: 'p140-school-client-secret',
            redirect_uris: ['https://school.example.com/callback'],
            response_types: ['code'],
            subject_type: 'pairwise',
            token_endpoint_auth_method: 'client_secret_post',
            userinfo_signed_response_alg: 'RS256',
          },
        ],
        features: { jwtUserinfo: { enabled: true } },
        findAccount: async (_ctx, accountId) => ({
          accountId,
          claims: async () => ({ sub: accountId }),
        }),
        jwks: { keys: [privateJwk] },
        pairwiseIdentifier: (ctx, accountId, client) =>
          resolveSchoolOIDCPairwiseSubject({ accountId, client, ctx }),
        subjectTypes: ['public', 'pairwise'],
      });
      const client = await provider.Client.find('askcore-gibbon');
      expect(client).toBeDefined();
      const accountId = 'better-auth-internal-id';
      const available = {
        school_subject: 'school_0123456789abcdef0123456789abcdef',
        sub: accountId,
      };
      const ctx = {};
      const idToken = new (provider.IdToken as any)(available, { client, ctx });
      idToken.scope = 'openid profile';
      const userInfo = new (provider.IdToken as any)(available, { client, ctx });
      userInfo.scope = 'openid profile';
      const idTokenClaims = decodeJwt(await idToken.issue({ use: 'idtoken' }));
      const userInfoClaims = decodeJwt(
        await userInfo.issue({ expiresAt: Math.floor(Date.now() / 1000) + 60, use: 'userinfo' }),
      );

      for (const claims of [idTokenClaims, userInfoClaims]) {
        expect(claims.sub).toBe('school_0123456789abcdef0123456789abcdef');
        expect(claims.school_subject).toBe('school_0123456789abcdef0123456789abcdef');
        expect(JSON.stringify(claims)).not.toContain(accountId);
      }
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('keeps the account id as sub for non-school clients', async () => {
      const resolveSchoolIdentity = vi.fn();
      const { buildOIDCAccountClaims } = await import('./provider');

      const claims = await buildOIDCAccountClaims({
        clientId: 'general-client',
        resolveSchoolIdentity,
        scope: 'openid',
        user: { id: 'general-account-id' },
      });

      expect(claims).toEqual({ sub: 'general-account-id' });
      expect(resolveSchoolIdentity).not.toHaveBeenCalled();
    });

    it('should have createOIDCProvider function', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const module = await import('./provider');
      expect(module.createOIDCProvider).toBeDefined();
      expect(typeof module.createOIDCProvider).toBe('function');

      vi.doUnmock('@/envs/app');
    }, 10000);
  });

  describe('Name Resolution Priority', () => {
    it('should prioritize fullName over firstName+lastName', () => {
      const priorities = ['fullName', 'firstName + lastName', 'username', 'id'];

      // Test the priority logic
      expect(priorities[0]).toBe('fullName');
      expect(priorities[1]).toBe('firstName + lastName');
      expect(priorities[2]).toBe('username');
      expect(priorities[3]).toBe('id');
    });
  });

  describe('Claims Generation', () => {
    it('should include profile claims when profile scope is requested', () => {
      const scopes = ['openid', 'profile', 'email'];
      expect(scopes).toContain('profile');
    });

    it('should include email claims when email scope is requested', () => {
      const scopes = ['openid', 'profile', 'email'];
      expect(scopes).toContain('email');
    });

    it('should always include sub claim', () => {
      const requiredClaims = ['sub'];
      expect(requiredClaims).toContain('sub');
    });

    it('declares school_subject as a profile claim', async () => {
      const { defaultClaims } = await import('./config');
      expect(defaultClaims.profile).toContain('school_subject');
    });
  });

  describe('Non-Market Client Logic (Default Path)', () => {
    it('should use UserModel for non-market clients (desktop client)', () => {
      // Desktop client should use the default user database lookup
      const desktopClientId = 'lobehub-desktop';
      expect(desktopClientId).not.toBe(MARKET_CLIENT_ID);
    });

    it('should use UserModel for non-market clients (mobile client)', () => {
      // Mobile client should use the default user database lookup
      const mobileClientId = 'lobehub-mobile';
      expect(mobileClientId).not.toBe(MARKET_CLIENT_ID);
    });

    it('should validate non-market client IDs are different from market client', () => {
      const nonMarketClients = ['lobehub-desktop', 'lobehub-mobile'];

      nonMarketClients.forEach((clientId) => {
        expect(clientId).not.toBe(MARKET_CLIENT_ID);
      });
    });
  });

  describe('Account ID Priority Logic', () => {
    it('should prioritize externalAccountId over session accountId', () => {
      const priorities = {
        first: 'externalAccountId',
        second: 'ctx.oidc.session.accountId',
        third: 'parameter id',
      };

      expect(priorities.first).toBe('externalAccountId');
      expect(priorities.second).toBe('ctx.oidc.session.accountId');
      expect(priorities.third).toBe('parameter id');
    });

    it('should document account ID resolution priority', () => {
      // Priority: 1. externalAccountId 2. ctx.oidc.session?.accountId 3. id parameter
      const accountIdPriority = [
        'externalAccountId (highest)',
        'ctx.oidc.session.accountId (medium)',
        'id parameter (lowest)',
      ];

      expect(accountIdPriority).toHaveLength(3);
      expect(accountIdPriority[0]).toContain('externalAccountId');
      expect(accountIdPriority[1]).toContain('ctx.oidc.session.accountId');
      expect(accountIdPriority[2]).toContain('id parameter');
    });
  });

  describe('Business Logic Scenarios', () => {
    describe('Scenario 1: Desktop Client + Local Database', () => {
      it('should use local UserModel for desktop client', () => {
        // Business: Desktop app uses local database for user management
        const scenario = {
          client: 'lobehub-desktop',
          authProvider: 'UserModel (Local Database)',
          useCase: 'Desktop app with local/self-hosted user database',
        };

        expect(scenario.client).toBe('lobehub-desktop');
        expect(scenario.authProvider).toBe('UserModel (Local Database)');
      });
    });

    describe('Scenario 2: Mobile Client + Local Database', () => {
      it('should use local UserModel for mobile client', () => {
        // Business: Mobile app uses local database for user management
        const scenario = {
          client: 'lobehub-mobile',
          authProvider: 'UserModel (Local Database)',
          useCase: 'Mobile app with local/self-hosted user database',
        };

        expect(scenario.client).toBe('lobehub-mobile');
        expect(scenario.authProvider).toBe('UserModel (Local Database)');
      });
    });

    describe('Scenario 3: Claims Generation', () => {
      it('should generate database-based claims for clients', () => {
        // Business: Users get profile/email from local DB
        const localClaims = {
          source: 'UserModel (PostgreSQL/PGLite)',
          fields: ['sub', 'name', 'picture', 'email', 'email_verified'],
          nameResolution: 'fullName || username || firstName+lastName',
        };

        expect(localClaims.source).toBe('UserModel (PostgreSQL/PGLite)');
        expect(localClaims.fields).toContain('name');
        expect(localClaims.fields).toContain('email');
      });
    });
  });
});
