'use client';

import { Form } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import { askCoreWorkbenchClient } from '../../AskCoreWorkbench/api';
import { type JsonRecord } from '../../AskCoreWorkbench/types';
import {
  approveAskCoreEducationIdentityClaim,
  assignAskCoreEducationRole,
  bindAskCoreEducationIdentity,
  createAskCoreClassUnit,
  createAskCoreCohortUnit,
  createAskCoreEducationIdentityClaim,
  createAskCoreEducationOrgUnit,
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  createAskCoreSchoolUnit,
  deleteAskCoreEducationRoleAssignment,
  fetchAskCoreEducationIdentityClaims,
  fetchAskCoreEducationOrgUnits,
  fetchAskCoreEducationRoleAssignments,
  fetchAskCoreOrganizations,
  rejectAskCoreEducationIdentityClaim,
  removeAskCoreOrganizationMember,
  setActiveAskCoreOrganization,
  unbindAskCoreEducationIdentity,
  updateAskCoreOrganization,
  updateAskCoreOrganizationMemberRole,
} from '../api';
import { ASKCORE_ORGANIZATION_CHANGED_EVENT } from '../events';
import {
  type AskCoreEducationIdentityClaim,
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitPayload,
  type AskCoreEducationRoleAssignment,
  type AskCoreInviteChannel,
  type AskCoreInviteExpiry,
  type AskCoreInvitePayload,
  type AskCoreOrganizationPayload,
  type AskCoreOrganizationRole,
} from '../types';

const notifyAskCoreOrganizationChanged = () => {
  window.dispatchEvent(new Event(ASKCORE_ORGANIZATION_CHANGED_EVENT));
};

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

  const [educationPayload, setEducationPayload] = useState<AskCoreEducationOrgUnitPayload | null>(
    null,
  );
  const [educationLoading, setEducationLoading] = useState(false);
  const [educationError, setEducationError] = useState<string | undefined>();
  const [educationRoleAssignments, setEducationRoleAssignments] = useState<
    AskCoreEducationRoleAssignment[]
  >([]);
  const [educationRoleLoading, setEducationRoleLoading] = useState(false);
  const [educationIdentityClaims, setEducationIdentityClaims] = useState<
    AskCoreEducationIdentityClaim[]
  >([]);
  const [educationIdentityClaimsLoading, setEducationIdentityClaimsLoading] = useState(false);
  const [educationTeachers, setEducationTeachers] = useState<JsonRecord[]>([]);
  const [educationStudents, setEducationStudents] = useState<JsonRecord[]>([]);

  const [creatingUnit, setCreatingUnit] = useState(false);
  const [assigningRole, setAssigningRole] = useState(false);
  const [bindingIdentity, setBindingIdentity] = useState(false);
  const [reviewingIdentityClaim, setReviewingIdentityClaim] = useState<number | null>(null);

  const [createForm] = Form.useForm();
  const [metaForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [orgUnitForm] = Form.useForm();
  const [orgRoleForm] = Form.useForm();
  const [identityForm] = Form.useForm();

  const current = payload?.current ?? null;
  const canManage = current?.role === 'owner' || current?.role === 'admin';
  const canInvite = payload?.permissions.canInvite ?? false;
  const canUpdateMeta = payload?.permissions.canUpdateMeta ?? false;
  const educationUnits = useMemo(() => educationPayload?.units ?? [], [educationPayload?.units]);

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

  const reloadEducationRoleAssignments = useCallback(async () => {
    if (!current?.id) {
      setEducationRoleAssignments([]);
      return;
    }
    setEducationRoleLoading(true);
    try {
      const next = await fetchAskCoreEducationRoleAssignments();
      setEducationRoleAssignments(next.items || []);
    } catch {
      setEducationRoleAssignments([]);
    } finally {
      setEducationRoleLoading(false);
    }
  }, [current?.id]);

  const reloadEducationIdentityClaims = useCallback(async () => {
    if (!current?.id) {
      setEducationIdentityClaims([]);
      return;
    }
    setEducationIdentityClaimsLoading(true);
    try {
      const next = await fetchAskCoreEducationIdentityClaims(canManage ? 'pending' : 'all');
      setEducationIdentityClaims(next.items || []);
    } catch {
      setEducationIdentityClaims([]);
    } finally {
      setEducationIdentityClaimsLoading(false);
    }
  }, [canManage, current?.id]);

  const reloadEducationRoleSubjects = useCallback(async () => {
    if (!current?.id) {
      setEducationTeachers([]);
      setEducationStudents([]);
      return;
    }
    const [teachers, students] = await Promise.all([
      askCoreWorkbenchClient.listAllResource('teachers').catch(() => []),
      askCoreWorkbenchClient.listAllResource('students').catch(() => []),
    ]);
    setEducationTeachers(teachers);
    setEducationStudents(students);
  }, [current?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void reloadEducationOrgUnits();
  }, [reloadEducationOrgUnits]);

  useEffect(() => {
    void reloadEducationRoleAssignments();
    void reloadEducationRoleSubjects();
    void reloadEducationIdentityClaims();
  }, [reloadEducationIdentityClaims, reloadEducationRoleAssignments, reloadEducationRoleSubjects]);

  const handleCreateOrganization = useCallback(async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const next = await createAskCoreOrganization(values);
      setPayload(next);
      setCreateOpen(false);
      createForm.resetFields();
      notifyAskCoreOrganizationChanged();
      message.success('组织已创建并激活');
    } finally {
      setCreating(false);
    }
  }, [createForm]);

  const handleActiveChange = useCallback(async (organizationId: string) => {
    const next = await setActiveAskCoreOrganization(organizationId);
    setPayload(next);
    setInviteResult(null);
    notifyAskCoreOrganizationChanged();
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

  const handleInviteChannelChange = useCallback(
    (nextChannel: AskCoreInviteChannel) => {
      setInviteChannel(nextChannel);
      setInviteResult(null);
      inviteForm.resetFields(['email']);
    },
    [inviteForm],
  );

  const handleCreateEducationUnit = useCallback(async () => {
    const values = await orgUnitForm.validateFields();
    setCreatingUnit(true);
    try {
      await createAskCoreEducationOrgUnit({
        description: values.description || undefined,
        entry_year: values.entry_year || undefined,
        name: values.name,
        parent_id: values.parent_id || undefined,
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

  const handleCreateSchoolUnit = useCallback(async () => {
    const values = await orgUnitForm.validateFields(['name', 'description']);
    setCreatingUnit(true);
    try {
      await createAskCoreSchoolUnit({
        description: values.description || undefined,
        name: values.name,
      });
      orgUnitForm.resetFields(['name', 'description']);
      await reloadEducationOrgUnits();
      message.success('学校已创建');
    } finally {
      setCreatingUnit(false);
    }
  }, [orgUnitForm, reloadEducationOrgUnits]);

  const handleAddSchoolUnit = useCallback(
    async (name: string, description?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setCreatingUnit(true);
      try {
        await createAskCoreSchoolUnit({
          description: description?.trim() || undefined,
          name: trimmed,
        });
        await reloadEducationOrgUnits();
        message.success('学校已创建');
      } finally {
        setCreatingUnit(false);
      }
    },
    [reloadEducationOrgUnits],
  );

  const handleAddEducationChild = useCallback(
    async (parent: AskCoreEducationOrgUnit, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setCreatingUnit(true);
      try {
        if (parent.unit_type === 'school') {
          const year = Number(trimmed.match(/\d{4}/)?.[0] || 0);
          if (!year) {
            message.error('届别请输入 4 位入学年份，例如 2025级');
            return;
          }
          await createAskCoreCohortUnit({
            entryYear: year,
            name: trimmed.endsWith('级') ? trimmed : `${year}级`,
            parentUnitId: parent.id,
          });
          message.success('届别已创建');
        } else if (parent.unit_type === 'cohort') {
          await createAskCoreClassUnit({ name: trimmed, parentUnitId: parent.id });
          message.success('班级已创建');
        }
        await reloadEducationOrgUnits();
      } finally {
        setCreatingUnit(false);
      }
    },
    [reloadEducationOrgUnits],
  );

  const handleAssignEducationRole = useCallback(async () => {
    const values = await orgRoleForm.validateFields();
    setAssigningRole(true);
    try {
      const subjectKind = values.subject_kind || 'member';
      const subjectValue = values.subject_value;
      await assignAskCoreEducationRole({
        org_unit_id: values.org_unit_id,
        role: values.role,
        subject:
          subjectKind === 'teacher'
            ? { kind: 'teacher', teacherId: Number(subjectValue) }
            : subjectKind === 'student'
              ? { kind: 'student', studentId: Number(subjectValue) }
              : { kind: 'member', userId: String(subjectValue) },
      });
      orgRoleForm.resetFields(['subject_value']);
      await reloadEducationRoleAssignments();
      await reloadEducationRoleSubjects();
      message.success('教育身份已分配');
    } finally {
      setAssigningRole(false);
    }
  }, [orgRoleForm, reloadEducationRoleAssignments, reloadEducationRoleSubjects]);

  const handleDeleteEducationRole = useCallback(
    async (assignmentId: number) => {
      await deleteAskCoreEducationRoleAssignment(assignmentId);
      await reloadEducationRoleAssignments();
      await reloadEducationRoleSubjects();
      message.success('教育身份已移除');
    },
    [reloadEducationRoleAssignments, reloadEducationRoleSubjects],
  );

  const handleBindEducationIdentity = useCallback(async () => {
    const values = await identityForm.validateFields([
      'identity_roster_kind',
      'identity_roster_id',
      'identity_user_id',
    ]);
    setBindingIdentity(true);
    try {
      await bindAskCoreEducationIdentity({
        better_auth_user_id: String(values.identity_user_id),
        roster_id: Number(values.identity_roster_id),
        roster_kind: values.identity_roster_kind,
      });
      await reloadEducationIdentityClaims();
      await reloadEducationRoleAssignments();
      await reloadEducationRoleSubjects();
      message.success('账号身份已绑定');
    } finally {
      setBindingIdentity(false);
    }
  }, [
    identityForm,
    reloadEducationIdentityClaims,
    reloadEducationRoleAssignments,
    reloadEducationRoleSubjects,
  ]);

  const handleCreateEducationIdentityClaim = useCallback(async () => {
    const values = await identityForm.validateFields([
      'identity_roster_kind',
      'identity_roster_id',
    ]);
    setBindingIdentity(true);
    try {
      await createAskCoreEducationIdentityClaim({
        roster_id: Number(values.identity_roster_id),
        roster_kind: values.identity_roster_kind,
      });
      await reloadEducationIdentityClaims();
      message.success('身份绑定申请已提交');
    } finally {
      setBindingIdentity(false);
    }
  }, [identityForm, reloadEducationIdentityClaims]);

  const handleApproveEducationIdentityClaim = useCallback(
    async (claimId: number) => {
      setReviewingIdentityClaim(claimId);
      try {
        await approveAskCoreEducationIdentityClaim(claimId);
        await reloadEducationIdentityClaims();
        await reloadEducationRoleAssignments();
        await reloadEducationRoleSubjects();
        message.success('身份申请已通过');
      } finally {
        setReviewingIdentityClaim(null);
      }
    },
    [reloadEducationIdentityClaims, reloadEducationRoleAssignments, reloadEducationRoleSubjects],
  );

  const handleRejectEducationIdentityClaim = useCallback(
    async (claimId: number) => {
      setReviewingIdentityClaim(claimId);
      try {
        await rejectAskCoreEducationIdentityClaim(claimId);
        await reloadEducationIdentityClaims();
        message.success('身份申请已拒绝');
      } finally {
        setReviewingIdentityClaim(null);
      }
    },
    [reloadEducationIdentityClaims],
  );

  const handleUnbindEducationIdentity = useCallback(
    async (rosterKind: 'student' | 'teacher', rosterId: number) => {
      setBindingIdentity(true);
      try {
        await unbindAskCoreEducationIdentity(rosterKind, rosterId);
        await reloadEducationIdentityClaims();
        await reloadEducationRoleAssignments();
        await reloadEducationRoleSubjects();
        message.success('账号身份绑定已解除');
      } finally {
        setBindingIdentity(false);
      }
    },
    [reloadEducationIdentityClaims, reloadEducationRoleAssignments, reloadEducationRoleSubjects],
  );

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
    setInviteChannel: handleInviteChannelChange,
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
    educationRoleAssignments,
    educationRoleLoading,
    educationIdentityClaims,
    educationIdentityClaimsLoading,
    educationTeachers,
    educationStudents,
    creatingUnit,
    assigningRole,
    bindingIdentity,
    reviewingIdentityClaim,
    orgUnitForm,
    orgRoleForm,
    identityForm,
    handleCreateEducationUnit,
    handleCreateSchoolUnit,
    handleAddSchoolUnit,
    handleAddEducationChild,
    handleAssignEducationRole,
    handleDeleteEducationRole,
    handleBindEducationIdentity,
    handleCreateEducationIdentityClaim,
    handleApproveEducationIdentityClaim,
    handleRejectEducationIdentityClaim,
    handleUnbindEducationIdentity,
    reloadEducationOrgUnits,
    reloadEducationRoleAssignments,
    reloadEducationIdentityClaims,

    // Members
    handleRoleChange,
    handleRemoveMember,

    // Global
    reload,
  };
};
