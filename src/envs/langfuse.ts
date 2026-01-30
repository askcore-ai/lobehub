/* eslint-disable sort-keys-fix/sort-keys-fix , typescript-sort-keys/interface */
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const getLangfuseConfig = () => {
  return createEnv({
    runtimeEnv: {
      LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || '',
      LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || '',
      LANGFUSE_HOST: process.env.LANGFUSE_HOST || 'http://127.0.0.1:13000',
    },

    server: {
      LANGFUSE_SECRET_KEY: z.string().optional(),
      LANGFUSE_PUBLIC_KEY: z.string().optional(),
      LANGFUSE_HOST: z.string().url(),
    },
  });
};

export const langfuseEnv = getLangfuseConfig();
