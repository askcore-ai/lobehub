import { Flexbox, Icon } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { SquareArrowOutUpRight } from 'lucide-react';
import { memo } from 'react';

export interface ItemLinkProps {
  href?: string;
  icon?: LucideIcon;
  label: string;
  value: string;
}

const ItemLink = memo<ItemLinkProps>(({ label, href }) => {
  const content = (
    <Flexbox horizontal align={'center'} gap={8}>
      {label}
      {href && <Icon color={cssVar.colorTextDescription} icon={SquareArrowOutUpRight} size={14} />}
    </Flexbox>
  );

  if (!href) return content;

  return (
    <a href={href} rel="noreferrer" style={{ color: 'inherit' }} target="_blank">
      {content}
    </a>
  );
});

export default ItemLink;
