import { BRANDING_LOGO_URL } from '@lobechat/business-const';
import type { MetaData } from '@lobechat/types';

export const DEFAULT_AVATAR = '/avatars/agent-default.png';
export const DEFAULT_USER_AVATAR = '😀';
export const DEFAULT_SUPERVISOR_AVATAR = '🎙️';
export const DEFAULT_SUPERVISOR_ID = 'supervisor';
export const DEFAULT_BACKGROUND_COLOR = undefined;
export const DEFAULT_AGENT_META: MetaData = {};
export const DEFAULT_INBOX_AVATAR = BRANDING_LOGO_URL || '/avatars/lobe-ai.png';
export const DEFAULT_USER_AVATAR_URL = BRANDING_LOGO_URL || '/icons/icon-192x192.png';

const LEGACY_LOBE_DEFAULT_AVATARS = new Set([
  '/avatars/lobe-ai.png',
  '/icons/icon-192x192.png',
  '/icons/icon-192x192.maskable.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512.maskable.png',
]);

export const isLegacyLobeDefaultAvatar = (avatar?: null | string) =>
  !!avatar && LEGACY_LOBE_DEFAULT_AVATARS.has(avatar.trim());

export const normalizeInboxAvatar = (avatar?: null | string) =>
  avatar && !isLegacyLobeDefaultAvatar(avatar) ? avatar : DEFAULT_INBOX_AVATAR;
