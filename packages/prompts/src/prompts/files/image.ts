import { ChatImageItem } from '@lobechat/types';

import { escapeXmlAttr } from '../search/xmlEscape';

const imagePrompt = (item: ChatImageItem, attachUrl: boolean) =>
  attachUrl
    ? `<image name="${escapeXmlAttr(item.alt)}" url="${escapeXmlAttr(item.url)}"></image>`
    : `<image name="${escapeXmlAttr(item.alt)}"></image>`;

export const imagesPrompts = (imageList: ChatImageItem[], attachUrl: boolean) => {
  if (imageList.length === 0) return '';

  const prompt = `<images>
<images_docstring>here are user upload images you can refer to</images_docstring>
${imageList.map((item) => imagePrompt(item, attachUrl)).join('\n')}
</images>`;

  return prompt.trim();
};
