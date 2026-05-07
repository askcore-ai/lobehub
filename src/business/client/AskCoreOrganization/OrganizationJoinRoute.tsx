'use client';

import { Alert, Button, Result, Skeleton } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { CheckCircle2 } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AskCoreOrganizationApiError, bootstrapAskCoreOrganization } from './api';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background: ${cssVar.colorBgLayout};
  `,
  panel: css`
    width: min(520px, 100%);
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;
    background: ${cssVar.colorBgContainer};
  `,
}));

const signupUrl = (token: string) =>
  `/signup?callbackUrl=${encodeURIComponent(`/join/organization/${encodeURIComponent(token)}`)}`;

const OrganizationJoinPage = memo(() => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!token) {
      setError('邀请链接无效');
      setLoading(false);
      return;
    }

    let ignore = false;
    let redirectTimer: number | undefined;
    const accept = async () => {
      try {
        await bootstrapAskCoreOrganization(token);
        if (!ignore) {
          setLoading(false);
          redirectTimer = window.setTimeout(() => navigate('/organization', { replace: true }), 700);
        }
      } catch (err) {
        if (ignore) return;
        if (err instanceof AskCoreOrganizationApiError && err.status === 401) {
          window.location.href = signupUrl(token);
          return;
        }
        setError(err instanceof Error ? err.message : '加入组织失败');
        setLoading(false);
      }
    };

    accept();
    return () => {
      ignore = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [navigate, token]);

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        {loading ? (
          <Result icon={<Skeleton.Avatar active size={56} />} title="正在处理邀请" />
        ) : error ? (
          <Result
            extra={<Button onClick={() => navigate('/')}>返回首页</Button>}
            status="warning"
            subTitle={<Alert showIcon message={error} type="warning" />}
            title="无法加入组织"
          />
        ) : (
          <Result
            icon={<CheckCircle2 color="var(--ant-color-success)" size={56} />}
            status="success"
            subTitle="正在打开组织管理页"
            title="已加入组织"
          />
        )}
      </div>
    </div>
  );
});

OrganizationJoinPage.displayName = 'OrganizationJoinPage';

export const AskCoreOrganizationJoinRoute = OrganizationJoinPage;
