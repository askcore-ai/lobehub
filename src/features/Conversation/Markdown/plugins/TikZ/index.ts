import { type FC } from 'react';

import { type MarkdownElement, type MarkdownElementProps } from '../type';
import rehypePlugin, { TIKZ_DIAGRAM_TAG } from './rehypePlugin';
import Render from './Render';

const TikZ: MarkdownElement = {
  Component: Render as FC<MarkdownElementProps>,
  rehypePlugin,
  scope: 'all',
  tag: TIKZ_DIAGRAM_TAG,
};

export default TikZ;
