import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── import under test ──────────────────────────────────────────
import { useSignUp } from './useSignUp';

// ── hoisted mocks ──────────────────────────────────────────────
const mockPrepareRegistration = vi.hoisted(() => vi.fn());
vi.mock('@/business/client/AskCoreWorkbench/api', () => ({ prepareRegistrationForSignup: mockPrepareRegistration }));

const mockPush = vi.hoisted(() => vi.fn());
const mockSearchParamsGet = vi.hoisted(() => vi.fn().mockReturnValue(null));
const mockMessageError = vi.hoisted(() => vi.fn());
const mockSignUpEmail = vi.hoisted(() => vi.fn());
const mockGetCaptchaTokenOnError = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

vi.mock('@/components/AntdStaticMethods', () => ({
  message: { error: mockMessageError, success: vi.fn() },
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  signUp: { email: mockSignUpEmail },
}));

vi.mock('@lobechat/business-const', () => ({
  BRANDING_NAME: 'LobeHub',
  ENABLE_BUSINESS_FEATURES: false,
}));

vi.mock('@/business/client/hooks/useBusinessSignup', () => ({
  useBusinessSignup: () => ({
    businessElement: null,
    getCaptchaTokenOnError: mockGetCaptchaTokenOnError,
    getFetchOptions: async () => undefined,
    preSocialSignupCheck: async () => true,
  }),
}));

// motion/react-m exports `form` as a motion HTML element — mock the whole module
vi.mock('motion/react-m', () => ({ form: {} }));

let mockEnableEmailVerification = false;
vi.mock('../../_layout/AuthServerConfigProvider', () => ({
  useAuthServerConfigStore: (selector: (s: any) => any) =>
    selector({
      serverConfig: {
        enableEmailVerification: mockEnableEmailVerification,
      },
    }),
}));

describe('useSignUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareRegistration.mockResolvedValue({ handle: 'a'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z' });
    mockSearchParamsGet.mockReturnValue(null);
    mockGetCaptchaTokenOnError.mockResolvedValue(undefined);
    mockEnableEmailVerification = false;
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should return initial values', () => {
      const { result } = renderHook(() => useSignUp());

      expect(result.current.loading).toBe(false);
      expect(result.current.onSubmit).toBeInstanceOf(Function);
    });
  });

  describe('handleSignUp', () => {
    const validValues = {
      confirmPassword: 'Password123!',
      email: 'new@example.com',
      password: 'Password123!',
    };

    it('does not create a user when intent preparation fails', async () => {
      mockPrepareRegistration.mockRejectedValueOnce(new Error('unavailable'));
      const { result } = renderHook(() => useSignUp());
      await act(async () => { await result.current.onSubmit(validValues); });
      expect(mockSignUpEmail).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should call signUp.email with correct params', async () => {
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(new Headers(mockSignUpEmail.mock.calls[0][0].fetchOptions.headers).get('x-askcore-registration-intent')).toBe('a'.repeat(64));
      expect(mockSignUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          name: 'new',
          password: 'Password123!',
        }),
      );
    });

    it('should redirect to callbackUrl on success', async () => {
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockPush).toHaveBeenCalledWith('/askcore/workbench?protocol=registration');
    });

    it('binds referral code from signup URL after successful sign up', async () => {
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'referral' ? 'ASK33' : null,
      );
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/askcore/billing/referrals/backfill',
        expect.objectContaining({
          body: JSON.stringify({ referral_code: 'ASK33' }),
          method: 'POST',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith('/askcore/workbench?protocol=registration');
    });

    it('should use callbackUrl from search params', async () => {
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'callbackUrl' ? '/dashboard' : null,
      );
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockSignUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({ callbackURL: '/askcore/workbench?protocol=registration' }),
      );
      expect(mockPrepareRegistration).toHaveBeenCalledWith('/dashboard');
      expect(mockPush).toHaveBeenCalledWith('/askcore/workbench?protocol=registration');
    });

    it('should redirect to verify-email when email verification is enabled', async () => {
      mockEnableEmailVerification = true;
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/verify-email?email=new%40example.com'),
      );
    });

    it('should derive username from email prefix', async () => {
      mockSignUpEmail.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit({ ...validValues, email: 'john.doe@gmail.com' });
      });

      expect(mockSignUpEmail).toHaveBeenCalledWith(expect.objectContaining({ name: 'john.doe' }));
    });

    it('should show error for duplicate email', async () => {
      mockSignUpEmail.mockResolvedValue({
        error: {
          code: 'FAILED_TO_CREATE_USER',
          details: { cause: { code: '23505' } },
        },
      });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockMessageError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should show error for invalid email', async () => {
      mockSignUpEmail.mockResolvedValue({
        error: { code: 'INVALID_EMAIL', message: 'Invalid email' },
      });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockMessageError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should show translated error for known error codes', async () => {
      mockSignUpEmail.mockResolvedValue({
        error: { code: 'SOME_KNOWN_CODE', message: 'fallback msg' },
      });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockMessageError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should retry sign up with captcha token when captcha is required', async () => {
      mockGetCaptchaTokenOnError.mockResolvedValue('captcha-token');
      mockSignUpEmail
        .mockResolvedValueOnce({
          error: { code: 'CAPTCHA_REQUIRED', message: 'Missing CAPTCHA response' },
        })
        .mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockSignUpEmail).toHaveBeenCalledTimes(2);
      expect(mockSignUpEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fetchOptions: { headers: { 'x-captcha-response': 'captcha-token', 'x-askcore-registration-intent': 'a'.repeat(64) } },
        }),
      );
      expect(mockMessageError).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/askcore/workbench?protocol=registration');
    });

    it('should stop sign up when captcha modal is cancelled', async () => {
      mockGetCaptchaTokenOnError.mockResolvedValue(null);
      mockSignUpEmail.mockResolvedValue({
        error: { code: 'CAPTCHA_REQUIRED', message: 'Missing CAPTCHA response' },
      });

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockSignUpEmail).toHaveBeenCalledTimes(1);
      expect(mockMessageError).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should show generic error on unexpected exception', async () => {
      mockSignUpEmail.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useSignUp());

      await act(async () => {
        await result.current.onSubmit(validValues);
      });

      expect(mockMessageError).toHaveBeenCalled();
    });

    it('should set loading during sign up and reset after', async () => {
      let resolveSignUp: (v: any) => void;
      mockSignUpEmail.mockReturnValue(
        new Promise((resolve) => {
          resolveSignUp = resolve;
        }),
      );

      const { result } = renderHook(() => useSignUp());

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.onSubmit(validValues);
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveSignUp!({ error: null });
        await submitPromise!;
      });

      expect(result.current.loading).toBe(false);
    });
  });
});
