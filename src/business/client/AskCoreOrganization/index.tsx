'use client';

import {
  Alert,
  Avatar,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  QRCode,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { type ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Building2,
  Check,
  Copy,
  Link2,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { type ReactNode, memo, useCallback, useEffect, useMemo, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import {
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  fetchAskCoreOrganizations,
  removeAskCoreOrganizationMember,
  setActiveAskCoreOrganization,
  updateAskCoreOrganization,
  updateAskCoreOrganizationMemberRole,
} from './api';
import {
  type AskCoreInviteChannel,
  type AskCoreInviteExpiry,
  type AskCoreInvitePayload,
  type AskCoreOrganizationMember,
  type AskCoreOrganizationPayload,
  type AskCoreOrganizationRole,
} from './types';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    padding-block: 22px 36px;
    padding-inline: 32px;
  `,
  createFooter: css`
    padding-block-start: 8px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  header: css`
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 20px;
  `,
  headerLeft: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
  `,
  headerTitle: css`
    display: flex;
    gap: 10px;
    align-items: center;

    font-size: 22px;
    font-weight: 650;
    line-height: 1.25;
    color: ${cssVar.colorText};
  `,
  hint: css`
    max-width: 720px;
    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextDescription};
  `,
  inviteResult: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;

    margin-block-start: 14px;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorFillQuaternary};

    @media (width <= 900px) {
      grid-template-columns: 1fr;
    }
  `,
  memberName: css`
    display: flex;
    min-width: 0;
    gap: 10px;
    align-items: center;
  `,
  memberText: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
  `,
  page: css`
    overflow: auto;
    min-width: 760px;
    height: 100%;
    background: ${cssVar.colorBgLayout};
  `,
  panel: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  panelBody: css`
    padding: 18px;
  `,
  panelHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    min-height: 48px;
    padding-block: 0;
    padding-inline: 18px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  primary: css`
    border-color: ${cssVar.colorText};
    border-radius: 999px;
    color: ${cssVar.colorBgContainer};
    background: ${cssVar.colorText};

    &:hover,
    &:focus {
      border-color: ${cssVar.colorTextSecondary} !important;
      color: ${cssVar.colorBgContainer} !important;
      background: ${cssVar.colorTextSecondary} !important;
    }
  `,
  readonlyMeta: css`
    .ant-descriptions-item-label {
      width: 140px;
      color: ${cssVar.colorTextDescription};
    }
  `,
  secondary: css`
    border-color: ${cssVar.colorBorderSecondary};
    border-radius: 999px;
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
  `,
  select: css`
    min-width: 240px;

    .ant-select-selector {
      border-radius: 999px !important;
    }
  `,
  table: css`
    .ant-table {
      background: ${cssVar.colorBgContainer};
    }

    .ant-table-thead > tr > th {
      height: 42px;
      padding-block: 0;
      padding-inline: 18px;
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};

      font-size: 12px;
      font-weight: 400;
      color: ${cssVar.colorTextDescription};

      background: ${cssVar.colorBgContainer};
    }

    .ant-table-tbody > tr > td {
      height: 52px;
      padding-block: 0;
      padding-inline: 18px;
      border-block-end: 1px solid ${cssVar.colorFillQuaternary};

      font-size: 13px;
      color: ${cssVar.colorText};
    }

    .ant-table-tbody > tr:last-child > td {
      border-block-end: 0;
    }
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  `,
  view: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,
}));

const roleLabels: Record<AskCoreOrganizationRole, string> = {
  admin: '管理员',
  member: '成员',
  owner: '所有者',
};

const roleColors: Record<AskCoreOrganizationRole, string> = {
  admin: 'blue',
  member: 'default',
  owner: 'gold',
};

const expiryOptions: { label: string; value: AskCoreInviteExpiry }[] = [
  { label: '30 分钟', value: '30m' },
  { label: '1 天', value: '1d' },
  { label: '7 天', value: '7d' },
  { label: '30 天', value: '30d' },
];

const inviteTabs: { icon: ReactNode; key: AskCoreInviteChannel; label: string }[] = [
  { icon: <Mail size={14} />, key: 'email', label: '邮箱' },
  { icon: <Link2 size={14} />, key: 'link', label: '邀请链接' },
  { icon: <QrCode size={14} />, key: 'qr', label: '二维码' },
];

export const canManageOrganization = (payload: AskCoreOrganizationPayload | null) =>
  !!payload?.permissions.canInvite || !!payload?.permissions.canManageMembers;

const copyText = async (value: string) => {
  await navigator.clipboard?.writeText(value);
  message.success('已复制');
};

const AskCoreOrganizationPage = memo(() => {
  const [payload, setPayload] = useState<AskCoreOrganizationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteChannel, setInviteChannel] = useState<AskCoreInviteChannel>('email');
  const [inviteResult, setInviteResult] = useState<AskCoreInvitePayload | null>(null);
  const [metaForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [inviteForm] = Form.useForm();

  const current = payload?.current ?? null;
  const canManage = canManageOrganization(payload);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await fetchAskCoreOrganizations();
      setPayload(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '组织加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    metaForm.setFieldsValue({
      contact: current?.contact || '',
      description: current?.description || '',
      name: current?.name || '',
    });
  }, [current?.contact, current?.description, current?.name, metaForm]);

  const handleCreateOrganization = useCallback(async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const next = await createAskCoreOrganization(values);
      setPayload(next);
      setCreateOpen(false);
      createForm.resetFields();
      message.success('组织已创建并激活');
    } finally {
      setCreating(false);
    }
  }, [createForm]);

  const handleActiveChange = useCallback(async (organizationId: string) => {
    const next = await setActiveAskCoreOrganization(organizationId);
    setPayload(next);
    setInviteResult(null);
    message.success('已切换激活组织');
  }, []);

  const handleSaveMeta = useCallback(async () => {
    if (!current) return;
    const values = await metaForm.validateFields();
    setSavingMeta(true);
    try {
      const next = await updateAskCoreOrganization(current.id, values);
      setPayload(next);
      message.success('组织信息已更新');
    } finally {
      setSavingMeta(false);
    }
  }, [current, metaForm]);

  const handleInvite = useCallback(async () => {
    if (!current) return;
    const values = await inviteForm.validateFields();
    setInviteLoading(true);
    try {
      const invite = await createAskCoreOrganizationInvite(current.id, {
        channel: inviteChannel,
        email: values.email,
        expiresIn: values.expiresIn,
        role: values.role,
      });
      setInviteResult(invite);
      if (inviteChannel === 'email') message.success('邀请邮件已发送');
    } finally {
      setInviteLoading(false);
    }
  }, [current, inviteChannel, inviteForm]);

  const handleRoleChange = useCallback(
    async (memberId: string, role: AskCoreOrganizationRole) => {
      if (!current) return;
      const next = await updateAskCoreOrganizationMemberRole(current.id, memberId, role);
      setPayload((previous) => (previous ? { ...previous, members: next.members } : previous));
      message.success('成员角色已更新');
    },
    [current],
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!current) return;
      const next = await removeAskCoreOrganizationMember(current.id, memberId);
      setPayload((previous) => (previous ? { ...previous, members: next.members } : previous));
      message.success('成员已移除');
    },
    [current],
  );

  const memberColumns = useMemo<ColumnsType<AskCoreOrganizationMember>>(
    () => [
      {
        dataIndex: 'name',
        key: 'name',
        render: (_, row) => (
          <div className={styles.memberName}>
            <Avatar size={30} src={row.avatar}>
              {row.name.slice(0, 1)}
            </Avatar>
            <div className={styles.memberText}>
              <span>{row.name}</span>
              <span className={styles.hint}>{row.email || '--'}</span>
            </div>
          </div>
        ),
        title: '成员',
      },
      {
        dataIndex: 'role',
        key: 'role',
        render: (role: AskCoreOrganizationRole, row) =>
          canManage ? (
            <Select
              size="small"
              style={{ width: 116 }}
              value={role}
              options={[
                { label: roleLabels.owner, value: 'owner' },
                { label: roleLabels.admin, value: 'admin' },
                { label: roleLabels.member, value: 'member' },
              ]}
              onChange={(value) => handleRoleChange(row.id, value)}
            />
          ) : (
            <Tag color={roleColors[role]} style={{ borderRadius: 999 }} variant="filled">
              {roleLabels[role]}
            </Tag>
          ),
        title: '角色',
        width: 150,
      },
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value?: string) => value?.slice(0, 10) || '--',
        title: '加入时间',
        width: 140,
      },
      ...(canManage
        ? [
            {
              dataIndex: 'action',
              key: 'action',
              render: (_: unknown, row: AskCoreOrganizationMember) => (
                <Tooltip title="删除成员">
                  <Button
                    danger
                    icon={<Trash2 size={14} />}
                    size="small"
                    type="text"
                    onClick={() => handleRemoveMember(row.id)}
                  />
                </Tooltip>
              ),
              title: '操作',
              width: 88,
            },
          ]
        : []),
    ],
    [canManage, handleRemoveMember, handleRoleChange],
  );

  const organizationOptions = useMemo(
    () =>
      (payload?.organizations || []).map((item) => ({
        label: (
          <Space>
            <Building2 size={14} />
            <span>{item.name}</span>
            {item.isActive && <Check size={14} />}
          </Space>
        ),
        value: item.id,
      })),
    [payload?.organizations],
  );

  const renderOrganizationSelect = () => (
    <Select
      className={styles.select}
      disabled={!payload?.organizations.length}
      popupRender={(menu) => (
        <>
          {menu}
          <div className={styles.createFooter}>
            <Button block icon={<Plus size={14} />} type="text" onClick={() => setCreateOpen(true)}>
              创建组织
            </Button>
          </div>
        </>
      )}
      options={organizationOptions}
      placeholder="选择组织"
      value={current?.id}
      onChange={handleActiveChange}
    />
  );

  const renderMetaPanel = () => (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>组织信息</span>
        {canManage && (
          <Button
            className={styles.primary}
            icon={<Save size={14} />}
            loading={savingMeta}
            size="small"
            onClick={handleSaveMeta}
          >
            保存
          </Button>
        )}
      </div>
      <div className={styles.panelBody}>
        {canManage ? (
          <Form form={metaForm} layout="vertical">
            <Form.Item label="组织名称" name="name" rules={[{ required: true, message: '请输入组织名称' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item label="组织简介" name="description">
              <Input.TextArea autoSize={{ maxRows: 4, minRows: 3 }} maxLength={500} />
            </Form.Item>
            <Form.Item label="联系人" name="contact">
              <Input maxLength={120} />
            </Form.Item>
          </Form>
        ) : (
          <Descriptions
            className={styles.readonlyMeta}
            column={1}
            items={[
              { key: 'name', label: '组织名称', children: current?.name || '--' },
              { key: 'description', label: '组织简介', children: current?.description || '--' },
              { key: 'contact', label: '联系人', children: current?.contact || '--' },
              { key: 'role', label: '我的角色', children: current ? roleLabels[current.role] : '--' },
            ]}
            size="small"
          />
        )}
      </div>
    </section>
  );

  const renderInvitePanel = () => {
    if (!canManage || !current) return null;

    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>邀请成员</span>
        </div>
        <div className={styles.panelBody}>
          <Tabs
            activeKey={inviteChannel}
            items={inviteTabs.map((item) => ({
              key: item.key,
              label: (
                <Space size={6}>
                  {item.icon}
                  {item.label}
                </Space>
              ),
            }))}
            onChange={(key) => {
              setInviteChannel(key as AskCoreInviteChannel);
              setInviteResult(null);
            }}
          />
          <Form
            form={inviteForm}
            initialValues={{ expiresIn: '1d', role: 'member' }}
            layout="vertical"
          >
            {inviteChannel === 'email' && (
              <Form.Item
                label="邮箱"
                name="email"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '邮箱格式不正确' },
                ]}
              >
                <Input placeholder="name@example.com" />
              </Form.Item>
            )}
            <Space align="end" wrap>
              <Form.Item label="邀请角色" name="role" style={{ minWidth: 160 }}>
                <Select
                  options={[
                    { label: roleLabels.member, value: 'member' },
                    { label: roleLabels.admin, value: 'admin' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="有效期" name="expiresIn" style={{ minWidth: 160 }}>
                <Select options={expiryOptions} />
              </Form.Item>
              <Form.Item>
                <Button
                  className={styles.primary}
                  icon={inviteChannel === 'email' ? <Mail size={14} /> : <Link2 size={14} />}
                  loading={inviteLoading}
                  onClick={handleInvite}
                >
                  {inviteChannel === 'email' ? '发送邀请' : '生成邀请'}
                </Button>
              </Form.Item>
            </Space>
          </Form>

          {inviteResult && (
            <div className={styles.inviteResult}>
              <Input readOnly value={inviteResult.link} />
              <Space>
                {inviteResult.channel === 'qr' && <QRCode size={104} value={inviteResult.link} />}
                <Button icon={<Copy size={14} />} onClick={() => copyText(inviteResult.link)}>
                  复制
                </Button>
              </Space>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle}>
              <UsersRound size={22} />
              组织
            </div>
            <div className={styles.hint}>组织决定教学工作台可访问的数据范围。一个用户同一时间只能激活一个组织。</div>
          </div>
          {renderOrganizationSelect()}
        </div>

        {error && (
          <Alert
            showIcon
            style={{ marginBottom: 16 }}
            title={error}
            type="error"
            action={
              <Button icon={<RefreshCw size={14} />} size="small" onClick={reload}>
                重试
              </Button>
            }
          />
        )}

        {loading ? (
          <Skeleton active />
        ) : current ? (
          <div className={styles.view}>
            {renderMetaPanel()}
            {renderInvitePanel()}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span>成员</span>
                <Tag style={{ borderRadius: 999 }} variant="filled">
                  {payload?.members.length || 0} 人
                </Tag>
              </div>
              <div className={styles.table}>
                <Table
                  columns={memberColumns}
                  dataSource={payload?.members || []}
                  pagination={false}
                  rowKey="id"
                  size="middle"
                />
              </div>
            </section>
          </div>
        ) : (
          <Empty
            description="还没有组织"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ paddingBlock: 80 }}
          >
            <Button className={styles.primary} icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              创建组织
            </Button>
          </Empty>
        )}
      </div>

      <Modal
        destroyOnHidden
        confirmLoading={creating}
        okText="创建并激活"
        open={createOpen}
        title="创建组织"
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreateOrganization}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="组织名称" name="name" rules={[{ required: true, message: '请输入组织名称' }]}>
            <Input maxLength={80} placeholder="例如：Seed 的组织" />
          </Form.Item>
          <Form.Item label="组织简介" name="description">
            <Input.TextArea autoSize={{ maxRows: 4, minRows: 3 }} maxLength={500} />
          </Form.Item>
          <Form.Item label="联系人" name="contact">
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

AskCoreOrganizationPage.displayName = 'AskCoreOrganizationPage';

export const AskCoreOrganizationRoute = AskCoreOrganizationPage;
