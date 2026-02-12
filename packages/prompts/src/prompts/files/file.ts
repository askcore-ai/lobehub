import { ChatFileItem } from '@lobechat/types';

import { escapeXmlAttr } from '../search/xmlEscape';

const filePrompt = (item: ChatFileItem, addUrl: boolean) => {
  const content = item.content || '';
  return addUrl
    ? `<file id="${escapeXmlAttr(item.id)}" name="${escapeXmlAttr(item.name)}" type="${escapeXmlAttr(item.fileType)}" size="${item.size}" url="${escapeXmlAttr(item.url)}">${content}</file>`
    : `<file id="${escapeXmlAttr(item.id)}" name="${escapeXmlAttr(item.name)}" type="${escapeXmlAttr(item.fileType)}" size="${item.size}">${content}</file>`;
};

export const filePrompts = (fileList: ChatFileItem[], addUrl: boolean) => {
  if (fileList.length === 0) return '';

  const prompt = `<files>
<files_docstring>here are user upload files you can refer to</files_docstring>
${fileList.map((item) => filePrompt(item, addUrl)).join('\n')}
</files>`;

  return prompt.trim();
};
