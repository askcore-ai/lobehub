import { trpc } from '../init';

export const oidcAuth = trpc.middleware(async (opts) => {
  const { ctx, next } = opts;

  // Check OIDC authentication
  if (ctx.oidcAuth) {
    return next({
      ctx: { oidcAuth: ctx.oidcAuth, userEmail: ctx.userEmail, userId: ctx.oidcAuth.sub },
    });
  }

  return next();
});
