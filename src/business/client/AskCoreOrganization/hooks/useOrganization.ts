'use client';

import { Form } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import {
  assignAskCoreEducationRole,
  createAskCoreEducationOrgUnit,
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  fetchAskCoreEducationOrgUnits,
  fetchAskCoreOrganizations,
  removeAskCoreOrganizationMember,
  setActiveAskCoreOrganization,
  updateAskCoreOrganization,
  updateAskCoreOrganizationMemberRole,
} from '../api';
import {
  type AskCoreEducationOrgUnitPayload,
  type AskCoreInviteChannel,
  type AskCoreInviteExpiry,
  type AskCoreInvitePayload,
  type AskCoreOrganizationPayload,
  type AskCoreOrganizationRole,
} from '../types';

export const useOrganization = () => {
  const [payload, setPayload] = useState<AskCoreOrganizationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [savingMeta, setSavingMeta] = useState(false);

  const [inviteChannel, setInviteChannel] = useState<AskCoreInviteChannel>('email');
  const [inviteResult, setInviteResult] = useState<AskCoreInvitePayload | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [educationPayload, setEducationPayload] = useState<AskCoreEducationOrgUnitPayload | null>(null);
  const [educationLoading, setEducationLoading] = useState(false);
  const [educationError, setEducationError] = useState<string | undefined>();

  const [creatingUnit, setCreatingUnit] = useState(false);
  const [assigningRole, setAssigningRole] = useState(false);

  const [createForm] = Form.useForm();
  const [metaForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [orgUnitForm] = Form.useForm();
  const [orgRoleForm] = Form.useForm();

  const current = payload?.current ?? null;
  const canManage = current?.role === 'owner' || current?.role === 'admin';
  const canInvite = payload?.permissions.canInvite ?? false;
  const canUpdateMeta = payload?.permissions.canUpdateMeta ?? false;
  const educationUnits = educationPayload?.units || [];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setPayload(await fetchAskCoreOrganizations());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadEducationOrgUnits = useCallback(async () => {
    if (!current?.id) {
      setEducationPayload(null);
      setEducationLoading(false);
      return;
    }
    setEducationLoading(true);
    setEducationError(undefined);
    try {
      setEducationPayload(await fetchAskCoreEducationOrgUnits());
    } catch (err) {
      setEducationPayload(null);
      setEducationError(err instanceof Error ? err.message : '教育组织加载失败');
    } finally {
      setEducationLoading(false);
    }
  }, [current?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void reloadEducationOrgUnits();
  }, [reloadEducationOrgUnits]);

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
        expiresIn: values.expiresIn as AskCoreInviteExpiry,
        role: values.role as Extract<AskCoreOrganizationRole, 'admin' | 'member'>,
      });
      setInviteResult(invite);
      if (inviteChannel === 'email') message.success('邀请邮件已发送');
    } finally {
      setInviteLoading(false);
    }
  }, [current, inviteChannel, inviteForm]);

  const handleCreateEducationUnit = useCallback(async () => {
    const values = await orgUnitForm.validateFields();
    setCreatingUnit(true);
    try {
      await createAskCoreEducationOrgUnit({
        class_id: values.class_id || undefined,
        description: values.description || undefined,
        grade_level_id: values.grade_level_id || undefined,
        name: values.name,
        parent_id: values.parent_id || undefined,
        school_id: values.school_id || undefined,
        sort_order: values.sort_order ?? 0,
        unit_type: values.unit_type,
      });
      orgUnitForm.resetFields(['name', 'description']);
      await reloadEducationOrgUnits();
      message.success('教育组织已创建');
    } finally {
      setCreatingUnit(false);
    }
  }, [orgUnitForm, reloadEducationOrgUnits]);

  const handleAssignEducationRole = useCallback(async () => {
    const values = await orgRoleForm.validateFields();
    setAssigningRole(true);
    try {
      await assignAskCoreEducationRole({
        better_auth_user_id: values.better_auth_user_id?.trim() || undefined,
        org_unit_id: values.org_unit_id,
        role: values.role,
        student_id: values.student_id || undefined,
        teacher_id: values.teacher_id || undefined,
      });
      orgRoleForm.resetFields(['better_auth_user_id', 'teacher_id', 'student_id']);
      message.success('教育身份已分配');
    } finally {
      setAssigningRole(false);
    }
  }, [orgRoleForm]);

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

  const organizations = payload?.organizations || [];
  const members = payload?.members || [];

  return {
    // State
    payload,
    loading,
    error,
    current,
    canManage,
    canInvite,
    canUpdateMeta,
    organizations,
    members,

    // Create org
    createOpen,
    setCreateOpen,
    creating,
    createForm,
    handleCreateOrganization,

    // Meta edit
    savingMeta,
    metaForm,
    handleSaveMeta,

    // Switch org
    handleActiveChange,

    // Invite
    inviteChannel,
    setInviteChannel,
    inviteResult,
    setInviteResult,
    inviteLoading,
    inviteForm,
    handleInvite,

    // Education orgs
    educationPayload,
    educationLoading,
    educationError,
    educationUnits,
    creatingUnit,
    assigningRole,
    orgUnitForm,
    orgRoleForm,
    handleCreateEducationUnit,
    handleAssignEducationRole,
    reloadEducationOrgUnits,

    // Members
    handleRoleChange,
    handleRemoveMember,

    // Global
    reload,
  };
};
