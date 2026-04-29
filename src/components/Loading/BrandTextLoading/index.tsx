import { BRANDING_NAME } from '@lobechat/business-const';
import { BrandLoading, LobeHubText } from '@lobehub/ui/brand';
import { memo, type SVGProps } from 'react';

import { isCustomBranding } from '@/const/version';

import styles from './index.module.css';

interface BrandTextLoadingProps {
  debugId: string;
}

const AskCoreText = memo<SVGProps<SVGSVGElement> & { size?: number | string }>(
  ({ size = '1em', style, ...rest }) => (
    <svg
      fill="currentColor"
      height={size}
      style={{ flex: 'none', lineHeight: 1, ...style }}
      viewBox="0 0 240 80"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <title>{BRANDING_NAME}</title>
      <text
        dominantBaseline="central"
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="44"
        fontWeight="700"
        letterSpacing="0"
        textAnchor="middle"
        x="120"
        y="40"
      >
        {BRANDING_NAME}
      </text>
    </svg>
  ),
);

AskCoreText.displayName = 'AskCoreText';

const BrandTextLoading = ({ debugId }: BrandTextLoadingProps) => {
  const showDebug = process.env.NODE_ENV === 'development' && debugId;
  const TextComponent = isCustomBranding ? AskCoreText : LobeHubText;

  return (
    <div className={styles.container}>
      <div aria-label="Loading" className={styles.brand} role="status">
        <BrandLoading size={40} text={TextComponent} />
      </div>
      {showDebug && (
        <div className={styles.debug}>
          <div className={styles.debugRow}>
            <code>Debug ID:</code>
            <span className={styles.debugTag}>
              <code>{debugId}</code>
            </span>
          </div>
          <div className={styles.debugHint}>only visible in development</div>
        </div>
      )}
    </div>
  );
};

export default BrandTextLoading;
