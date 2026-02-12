import { ChatVideoItem } from '@lobechat/types';

import { escapeXmlAttr } from '../search/xmlEscape';

const videoPrompt = (item: ChatVideoItem, attachUrl: boolean) =>
  attachUrl
    ? `<video name="${escapeXmlAttr(item.alt)}" url="${escapeXmlAttr(item.url)}"></video>`
    : `<video name="${escapeXmlAttr(item.alt)}"></video>`;

export const videosPrompts = (videoList: ChatVideoItem[], addUrl: boolean = true) => {
  if (videoList.length === 0) return '';

  const prompt = `<videos>
<videos_docstring>here are user upload videos you can refer to</videos_docstring>
${videoList.map((item) => videoPrompt(item, addUrl)).join('\n')}
</videos>`;

  return prompt.trim();
};
