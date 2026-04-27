'use client';

import { Center, Flexbox } from '@lobehub/ui';
import { Spin } from 'antd';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import { remoteServerService } from '@/services/electron/remoteServer';
import { electronSystemService } from '@/services/electron/system';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';

import {
  ASKCORE_BILLING_OPEN_URL_MESSAGE,
  type AskCoreBillingPageKey,
  buildAskCoreBillingEmbedUrl,
  isAllowedBillingExternalUrl,
} from './AskCoreBillingPage';

const PARTITION_ID = 'persist:askcore-subscription';

interface SubscriptionIframeWrapperProps {
  page: AskCoreBillingPageKey;
}

const currentOrigin = () => (typeof window === 'undefined' ? 'https://askcore.cn' : window.location.origin);

export const SubscriptionIframeWrapper = memo<SubscriptionIframeWrapperProps>(({ page }) => {
  const [sessionReady, setSessionReady] = useState(!isDesktop);
  const [error, setError] = useState<string | null>(null);
  const webviewRef = useRef<HTMLElement>(null);
  const { i18n } = useTranslation();
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);

  const iframeUrl = useMemo(
    () =>
      buildAskCoreBillingEmbedUrl({
        language: i18n.language,
        origin: currentOrigin(),
        page,
      }),
    [i18n.language, page],
  );

  const embedOrigin = useMemo(() => new URL(iframeUrl, currentOrigin()).origin, [iframeUrl]);

  const openExternalUrl = useCallback(
    (url: string) => {
      if (!isAllowedBillingExternalUrl(url, { appOrigin: currentOrigin(), embedOrigin })) {
        console.warn('[AskCoreBilling] Blocked external billing URL:', url);
        return;
      }

      if (isDesktop) {
        electronSystemService.openExternalLink(url);
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [embedOrigin],
  );

  useEffect(() => {
    if (!isDesktop) return;

    let mounted = true;
    const initSession = async () => {
      try {
        await remoteServerService.setupSubscriptionWebviewSession(PARTITION_ID);
        if (mounted) setSessionReady(true);
      } catch (err) {
        console.error('Failed to initialize AskCore subscription webview session:', err);
        if (mounted) setError('Failed to initialize subscription session');
      }
    };

    initSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== embedOrigin) return;
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type === ASKCORE_BILLING_OPEN_URL_MESSAGE && data.url) {
        openExternalUrl(data.url);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [embedOrigin, openExternalUrl]);

  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!isDesktop || !webview || !sessionReady) return;

    const linkClickPrefix = '__ASKCORE_BILLING_EXTERNAL_LINK__:';

    const handleDomReady = () => {
      webview.executeJavaScript(`
        (function() {
          const PREFIX = '${linkClickPrefix}';

          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
              e.preventDefault();
              e.stopPropagation();
              console.log(PREFIX + link.href);
            }
          }, true);

          const originalOpen = window.open;
          window.open = function(url) {
            if (url) {
              const absoluteUrl = new URL(url, window.location.href).href;
              console.log(PREFIX + absoluteUrl);
            }
            return null;
          };
        })();
      `);
    };

    const handleConsoleMessage = (event: any) => {
      const message = event.message as string | undefined;
      if (message?.startsWith(linkClickPrefix)) {
        openExternalUrl(message.slice(linkClickPrefix.length));
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [openExternalUrl, sessionReady]);

  const handleRetry = useCallback(() => {
    if (!isDesktop) return;
    setError(null);
    setSessionReady(false);

    remoteServerService
      .setupSubscriptionWebviewSession(PARTITION_ID)
      .then(() => setSessionReady(true))
      .catch(() => setError('Failed to initialize subscription session'));
  }, []);

  if (!enableBusinessFeatures) return null;

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>{error}</p>
        <button type="button" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (isDesktop && !sessionReady) {
    return (
      <Flexbox height={'100%'} width={'100%'}>
        <Center flex={1}>
          <Spin />
        </Center>
      </Flexbox>
    );
  }

  return (
    <Flexbox height={'100%'} style={{ position: 'relative' }} width={'100%'}>
      {isDesktop ? (
        <webview
          partition={PARTITION_ID}
          ref={webviewRef}
          src={iframeUrl}
          style={{
            border: 0,
            height: '100%',
            inset: 0,
            position: 'absolute',
            width: '100%',
          }}
        />
      ) : (
        <iframe
          referrerPolicy="same-origin"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          src={iframeUrl}
          style={{
            border: 0,
            height: '100%',
            inset: 0,
            position: 'absolute',
            width: '100%',
          }}
          title={`AskCore subscription ${page}`}
        />
      )}
    </Flexbox>
  );
});

SubscriptionIframeWrapper.displayName = 'SubscriptionIframeWrapper';
