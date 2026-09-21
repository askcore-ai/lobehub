import { auth } from '@/auth';
import { forwardRegistrationRequest } from '@/server/services/registrationProvisioning';

type Context = { params: Promise<{ action: string }> };
const forward = async (request: Request, context: Context) =>
  forwardRegistrationRequest(request, (await context.params).action, auth.handler);

export const GET = forward;
export const POST = forward;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
