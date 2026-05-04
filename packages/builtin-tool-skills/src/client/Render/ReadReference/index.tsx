'use client';

import { type BuiltinRenderProps } from '@lobechat/types';
import { Block, Flexbox, Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import type { ReadReferenceParams, ReadReferenceState } from '../../../types';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    padding-inline: 8px 0;
  `,
}));

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ReadReference = memo<BuiltinRenderProps<ReadReferenceParams, ReadReferenceState>>(
  ({ pluginState }) => {
    const { path, size } = pluginState || {};

    if (!path) return null;

    const sizeText = size ? formatSize(size) : '';

    return (
      <Flexbox className={styles.container} gap={8}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text code ellipsis as={'span'} fontSize={12}>
            {path}
          </Text>
          {sizeText && (
            <Text code noWrap as={'span'} fontSize={12} type={'secondary'}>
              {sizeText}
            </Text>
          )}
        </Flexbox>

        <Block padding={12} variant={'outlined'}>
          <Text fontSize={12} type={'secondary'}>
            Skill reference content is hidden.
          </Text>
        </Block>
      </Flexbox>
    );
  },
);

ReadReference.displayName = 'ReadReference';

export default ReadReference;
