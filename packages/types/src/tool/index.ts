import type { ToolManifest, ToolManifestType } from './manifest';
import type { CustomPluginParams } from './plugin';
import type { LobeToolType } from './tool';

export type LobeToolSource = LobeToolType | 'builtin' | 'market' | 'user';

export interface LobeTool {
  customParams?: CustomPluginParams | null;
  identifier: string;
  manifest?: ToolManifest | null;
  /**
   * use for runtime
   */
  runtimeType?: ToolManifestType;
  settings?: any;
  // TODO: remove type and then make it required
  source?: LobeToolSource;
  /**
   * need to be replaced with source
   * @deprecated
   */
  type: LobeToolType;
}

export type LobeToolRenderType = ToolManifestType;

export * from './builtin';
export * from './crawler';
export * from './error';
export * from './interpreter';
export * from './intervention';
export * from './manifest';
export * from './plugin';
export * from './search';
export * from './tool';
