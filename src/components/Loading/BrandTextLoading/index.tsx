import { BrandLoading } from '@lobehub/ui/brand';

import AskCoreText from '../AskCoreText';
import styles from './index.module.css';

interface BrandTextLoadingProps {
  debugId: string;
}

const BrandTextLoading = ({ debugId }: BrandTextLoadingProps) => {
  const showDebug = process.env.NODE_ENV === 'development' && debugId;

  return (
    <div className={styles.container}>
      <div aria-label="Loading" className={styles.brand} role="status">
        <BrandLoading size={40} text={AskCoreText} />
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
