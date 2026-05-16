import { type LobeTool } from '@lobechat/types';
import { z } from 'zod';

import { PluginModel } from '@/database/models/plugin';
import { getServerDB } from '@/database/server';
import { authedProcedure, publicProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const pluginProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: { pluginModel: new PluginModel(ctx.serverDB, ctx.userId) },
  });
});

const pluginSourceSchema = z.enum(['builtin', 'market', 'user']);

export const pluginRouter = router({
  createOrInstallPlugin: pluginProcedure
    .input(
      z.object({
        customParams: z.any(),
        identifier: z.string(),
        manifest: z.any(),
        settings: z.any(),
        source: pluginSourceSchema.optional(),
        type: z.enum(['plugin', 'customPlugin']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.pluginModel.findById(input.identifier);

      // if not exist, we should create the plugin
      if (!result) {
        const data = await ctx.pluginModel.create({
          customParams: input.customParams,
          identifier: input.identifier,
          manifest: input.manifest,
          settings: input.settings,
          source: input.source,
          type: input.type,
        });

        return data.identifier;
      }

      // or refresh the full install payload. MCP plugins keep their connection
      // contract in customParams, so manifest-only updates leave stale installs broken.
      await ctx.pluginModel.update(input.identifier, {
        customParams: input.customParams,
        manifest: input.manifest,
        settings: input.settings,
        source: input.source,
        type: input.type,
      });
    }),

  createPlugin: pluginProcedure
    .input(
      z.object({
        customParams: z.any(),
        identifier: z.string(),
        manifest: z.any(),
        source: pluginSourceSchema.optional(),
        type: z.enum(['plugin', 'customPlugin']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const data = await ctx.pluginModel.create({
        customParams: input.customParams,
        identifier: input.identifier,
        manifest: input.manifest,
        source: input.source,
        type: input.type,
      });

      return data.identifier;
    }),

  // TODO: In the future, this method also needs to use authedProcedure
  getPlugins: publicProcedure.query(async ({ ctx }): Promise<LobeTool[]> => {
    if (!ctx.userId) return [];

    const serverDB = await getServerDB();
    const pluginModel = new PluginModel(serverDB, ctx.userId);

    return pluginModel.query();
  }),

  removeAllPlugins: pluginProcedure.mutation(async ({ ctx }) => {
    return ctx.pluginModel.deleteAll();
  }),

  removePlugin: pluginProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.pluginModel.delete(input.id);
    }),

  updatePlugin: pluginProcedure
    .input(
      z.object({
        customParams: z.any().optional(),
        id: z.string(),
        manifest: z.any().optional(),
        settings: z.any().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.pluginModel.update(input.id, {
        customParams: input.customParams,
        manifest: input.manifest,
        settings: input.settings,
      });
    }),
});

export type PluginRouter = typeof pluginRouter;
