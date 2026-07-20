'use client';

import { OpenAI } from '@lobehub/icons';
import { Button, Flexbox, Icon, Tag, Text } from '@lobehub/ui';
import {
  Alert,
  Badge,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Progress,
  QRCode,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Check,
  Copy,
  Database,
  FileText,
  Gift,
  Link,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ProductLogo } from '@/components/Branding';

export const ASKCORE_BILLING_OPEN_URL_MESSAGE = 'askcore-billing:open-url';

export const ASKCORE_BILLING_PAGE_KEYS = [
  'billing',
  'credits',
  'notification',
  'plans',
  'referral',
  'usage',
] as const;

export type AskCoreBillingPageKey = (typeof ASKCORE_BILLING_PAGE_KEYS)[number];
type BillingProvider = 'alipay' | 'stripe' | 'wechat';
type BillingPeriodId = 'monthly' | 'payonce' | 'yearly';

export interface AskCoreBillingPlan {
  badge?: string;
  badge_zh?: string;
  benefits?: {
    advanced?: Record<string, boolean>;
    cloud?: Record<string, boolean>;
    credits?: { examples?: { messages?: number; model: string }[]; monthly_credits?: number };
    knowledge_base?: {
      enabled?: boolean;
      file_storage_gb?: number;
      vector_storage_entries?: number;
    };
    providers?: Record<string, boolean>;
    support?: string;
  };
  credit_examples?: { messages?: number; model: string }[];
  description?: string;
  description_zh?: string;
  display_name: string;
  display_name_zh?: string;
  features: string[];
  file_storage_gb?: number;
  id: string;
  monthly_credits: number;
  monthly_price_cny?: number;
  monthly_price_usd: number;
  one_time_price_cny?: number | null;
  one_time_price_usd?: number | null;
  support?: string;
  support_zh?: string;
  topup_unit_price_cny?: number;
  topup_unit_price_usd?: number;
  vector_storage_entries?: number;
  yearly_discount_percent?: number;
  yearly_discount_percent_cny?: number;
  yearly_monthly_price_cny?: number | null;
  yearly_monthly_price_usd?: number | null;
  yearly_price_cny?: number | null;
  yearly_price_usd?: number | null;
}

export interface AskCoreCreditPack {
  credits: number;
  display_name: string;
  display_name_zh?: string;
  id: string;
  price_cny?: number;
  price_usd: number;
  source?: string;
  unit_price_cny_per_million?: number;
  unit_price_usd_per_million?: number;
  validity_months?: number;
}

interface BillingPeriod {
  description?: string;
  id: BillingPeriodId;
  label: string;
}

interface ModelPricingRow {
  input_credits_per_1m: number;
  model: string;
  output_credits_per_1m: number;
  provider?: string;
}

interface PlanComparisonGroup {
  key: string;
  rows: {
    label: string;
    unit?: string;
    values: Record<string, number | string | null>;
  }[];
  title: string;
}

interface AskCorePlansPayload {
  billing_enabled: boolean;
  billing_periods?: BillingPeriod[];
  credit_packs: AskCoreCreditPack[];
  credit_unit: string;
  currency: string;
  faq?: { answer: string; question: string }[];
  mode: string;
  model_pricing?: {
    description?: string;
    text?: ModelPricingRow[];
  };
  organization_seats?: {
    enabled: boolean;
    fallback_to_personal: boolean;
    min_paid_seats: number;
  };
  plan_comparison?: PlanComparisonGroup[];
  plans: AskCoreBillingPlan[];
  providers?: Partial<Record<BillingProvider, { checkout_available?: boolean; enabled: boolean }>>;
}

interface AskCorePersonalPrepaidTerm {
  id: number;
  interval: 'month' | 'year';
  plan_id: string;
  status: 'active' | 'canceled' | 'expired' | 'scheduled';
  term_end: string;
  term_start: string;
}

interface AskCorePersonalAccount {
  account_id: number;
  balance_credits: number;
  current_term: AskCorePersonalPrepaidTerm | null;
  next_payment: null;
  plan_id: string;
  renewal_mode: 'manual';
  scheduled_terms: AskCorePersonalPrepaidTerm[];
  subscription_status: string;
}

export interface AskCoreOrganizationSeat {
  plan_id: string;
  quota_credits_remaining: number;
  quota_credits_total: number;
  quota_credits_used: number;
  seat_id: number;
  status: string;
  user_id: string;
}

export interface AskCoreBillingOrganization {
  account_id: number;
  auth_org_id: string;
  current_user_seat?: AskCoreOrganizationSeat | null;
  fallback_to_personal: boolean;
  min_paid_seats: number;
  seats: AskCoreOrganizationSeat[];
}

interface AskCoreAccountPayload {
  billing_enabled: boolean;
  credit_unit: string;
  currency: string;
  mode: string;
  organization?: AskCoreBillingOrganization | null;
  personal: AskCorePersonalAccount;
}

interface AskCoreUsageRow {
  amount_credits: number;
  cost_usd?: number | null;
  created_at?: string | null;
  id: number;
  kind: string;
  model?: string | null;
  scope_type: string;
  source: string;
  tokens_completion?: number | null;
  tokens_prompt?: number | null;
  tokens_total?: number | null;
  trigger?: string | null;
  type?: string | null;
}

interface AskCoreUsagePayload {
  items: AskCoreUsageRow[];
  summary?: {
    by_scope?: Record<string, number>;
    by_source?: Record<string, number>;
    period?: string;
    total_credits_used?: number;
    total_tokens?: number;
  };
}

interface AskCoreCreditPackageRow {
  amount_usd?: number | null;
  expires_at?: string | null;
  id: number;
  initial_credits: number;
  purchased_at?: string | null;
  remaining_credits: number;
  source: string;
  status: string;
}

interface AskCoreCreditPackagesPayload {
  available_packs: AskCoreCreditPack[];
  balance_credits: number;
  items: AskCoreCreditPackageRow[];
}

interface AskCoreAutoTopupPayload {
  enabled: boolean;
  has_payment_method?: boolean;
  monthly_limit_usd: number;
  monthly_topup_amount_usd?: number;
  target_credits: number;
  threshold_credits: number;
}

interface AskCoreInvoiceRow {
  amount_due_cny?: number | null;
  amount_due_usd: number;
  amount_paid_cny?: number | null;
  amount_paid_usd: number;
  created_at?: string | null;
  currency?: string | null;
  hosted_invoice_url?: string | null;
  id: number;
  provider: string;
  provider_invoice_id?: string | null;
  status: string;
}

interface AskCoreBillingHistoryPayload {
  items: AskCoreInvoiceRow[];
  summary?: AskCorePersonalAccount;
}

interface AskCoreReferralPayload {
  available_balance?: number;
  enabled: boolean;
  items: {
    created_at?: string | null;
    invitee_email?: string | null;
    invitee_user_id: string;
    rewarded_at?: string | null;
    reward_credits: number;
    status: string;
  }[];
  referral_code?: string;
  referral_link?: string;
  reward_credits: number;
  rules?: Record<string, string | number>;
  total_invites: number;
  total_rewarded: number;
}

interface CheckoutResponse {
  amount?: { currency: string; display: string; total: number };
  checkout_id: string;
  checkout_type?: 'qrcode' | 'redirect';
  code_url?: string | null;
  expires_at?: string | null;
  live_payment: boolean;
  mode: string;
  paid_at?: string | null;
  poll_url?: string | null;
  provider: BillingProvider;
  provider_transaction_id?: string | null;
  purpose: string;
  status: string;
  url: string;
}

interface ResourceState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

const isChineseLanguage = (language?: string) => language?.toLowerCase().startsWith('zh') ?? false;

const createMoneyFormatter = (isChinese: boolean) =>
  new Intl.NumberFormat(isChinese ? 'zh-CN' : 'en-US', {
    currency: isChinese ? 'CNY' : 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  });

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const enCopy = {
  actions: {
    bind: 'Confirm Binding',
    changePlan: 'Change Plan',
    copy: 'Copy',
    copyLink: 'Copy Link',
    currentPlan: 'Current Plan',
    getStarted: 'Get Started',
    purchase: 'Purchase',
    purchaseNow: 'Purchase Now',
    save: 'Save',
    viewBilling: 'View Billing',
  },
  billing: {
    amount: 'Amount',
    billingCycle: 'Prepaid Term',
    billingHistory: 'Billing History',
    billingSummary: 'Billing Summary',
    currentPlan: 'Current Plan',
    endDate: 'Paid Access Ends',
    intervalFallback: 'Monthly',
    manualRenewal: 'Manual renewal — no automatic charge',
    noScheduledTerms: 'No prepaid terms are queued',
    orderNumber: 'Order Number',
    paymentDate: 'Payment Date',
    paymentGateway: 'Payment Gateway',
    renewalMode: 'Renewal',
    scheduledTerms: 'Scheduled Terms',
    startDate: 'Paid Access Starts',
    status: 'Status',
    transactionStatus: 'Transaction Status',
  },
  credits: {
    autoTopup: 'Auto Top-Up',
    autoTopupNoPayment:
      'No payment method is on file. Auto top-up will stay shadow-safe until a payment method is available.',
    autoTopupSaved: 'Auto top-up settings saved',
    balance: 'Balance',
    currentPlan: 'Current Plan',
    disabled: 'Disabled',
    enabled: 'Enabled',
    expiresAt: 'Expires At',
    freeNeedsPaidPlan: 'Free users need to subscribe to a paid plan before topping up credits.',
    monthlyLimit: 'Monthly Limit',
    myPackages: 'My Credit Packages',
    noPacks: 'No credit packs are currently available.',
    noPackages: 'No credit packages',
    purchaseCredits: 'Purchase Credits',
    purchasedOn: 'Purchased On',
    source: 'Source',
    status: 'Status',
    subscriptionCredits: 'Subscription Credits',
    targetBalance: 'Target Balance',
    threshold: 'Threshold',
    topupBalance: 'Top-up Credits Balance',
    unitPriceFallback: 'Unit price follows local catalog',
    validityMonths: 'months validity',
  },
  errors: {
    bindFailed: 'Binding failed',
    checkoutFailed: 'Checkout failed',
    saveAutoTopupFailed: 'Failed to save auto top-up settings',
    sessionUnavailable: 'LobeHub billing session is unavailable. Please sign in to AskCore again.',
    updateFailed: 'Update failed',
  },
  messages: {
    bindSuccess: 'Invite code bound',
    copied: 'Copied',
    referralSaved: 'Referral code saved',
  },
  payment: {
    close: 'Cancel Payment',
    closed: 'Order closed',
    expiresAt: 'Expires At',
    failed: 'Payment failed',
    pollFailed: 'Unable to refresh payment status',
    returnError: 'Unable to refresh returned payment.',
    returnTitle: 'Payment status',
    refunded: 'Refunded',
    scanHint: 'Scan with WeChat to complete payment.',
    succeeded: 'Payment completed',
    title: 'WeChat Pay',
    waiting: 'Waiting for payment',
    wechatUnavailable: 'WeChat Pay is not ready for this account.',
  },
  page: {
    subtitle: 'Usage, fixed prepaid terms, credits, billing, and referral rewards.',
    titles: {
      billing: 'Billing',
      credits: 'Credits',
      notification: 'Notifications',
      plans: 'Plans',
      referral: 'Referral Rewards',
      usage: 'Usage',
    },
  },
  plans: {
    available: 'available',
    comparison: 'Plan Comparison',
    currentPlan: 'Current Plan',
    detailPayOnce: 'One-time payment',
    detailYearly: 'per year',
    faq: 'Frequently Asked Questions',
    faqRenewalAnswer:
      'Each purchase is a fixed prepaid term. Renew manually before or after expiry; AskCore will not charge automatically.',
    faqRenewalQuestion: 'How do I renew my paid term?',
    fileStorage: 'File Storage',
    noProvider: 'No payment provider is enabled.',
    perMonth: 'per month',
    perMonthBilledYearly: 'per month, billed yearly',
    planPricing: 'Plans & Pricing',
    pricingSubtitle: 'Start with AskCore local billing. No official cloud dependency.',
    supportFallback: 'Community support',
    textModelPricing: 'Text Model Pricing',
    vectorStorage: 'Vector Storage',
  },
  periods: {
    monthly: 'Monthly',
    oneTime: 'One-time',
    yearly: 'Yearly',
    yearlyOff: 'off',
  },
  intervals: {
    monthly: 'Monthly',
    oneTime: 'One-time',
    yearly: 'Yearly',
  },
  referral: {
    availableBalance: 'Available Balance',
    backfillDescription: 'Forgot to enter an invite code? Bind it here before reward expiry.',
    backfillTitle: 'Backfill Invite Code',
    codeDescription: 'Share your exclusive referral code to invite friends to register.',
    codePattern: 'Use 2-8 letters, numbers or underscores',
    codeTitle: 'My Referral Code',
    history: 'Referral History',
    inviteeEmail: 'Invitee Email',
    linkDescription:
      'Copy the link and share with friends. Complete registration to receive rewards.',
    linkTitle: 'Referral Link',
    myReward: 'My Reward',
    noHistory: 'No referral history',
    notEnabled: 'Referral rewards are not currently enabled.',
    placeholder: 'Enter invite code or link',
    programRules: 'Program Rules',
    registrationTime: 'Registration Time',
    rules: {
      expiry: 'Credit validity: Referral credits expire after {{days}} days.',
      priority:
        'Deduction priority: free credits, subscription credits, referral credits, then top-up credits.',
      registration:
        'Registration method: Invited users register via referral link or enter referral code on registration page',
      reward: 'Reward: referrer and invitee each receive {{reward}}.',
      rewardDelay:
        'Reward processing: credits are issued after verification, within {{hours}} hours.',
      validAction: 'Valid action: {{action}}.',
      validActions: {
        firstBillableUsage: 'first billable usage',
      },
    },
    status: 'Status',
    totalInvites: 'Total Invites',
    validConversions: 'Valid Conversions',
  },
  statuses: {
    active: 'Active',
    canceled: 'Canceled',
    cancelled: 'Canceled',
    canary: 'Canary',
    enforce: 'Enforce',
    free: 'Free',
    paid: 'Paid',
    pending: 'Pending',
    pending_reward: 'Pending reward',
    processing: 'Processing',
    registered: 'Registered',
    revoked: 'Revoked',
    rewarded: 'Rewarded',
    shadow: 'Shadow',
    suspected: 'Needs review',
    trialing: 'Trialing',
    unpaid: 'Unpaid',
  },
  tables: {
    createdAt: 'Created At',
    credits: 'Credits',
    inputTokens: 'Input 1M Tokens',
    model: 'Model',
    outputTokens: 'Output 1M Tokens',
    provider: 'Provider',
    tokenUsage: 'Token Usage',
    trigger: 'Trigger',
    type: 'Type',
  },
  units: {
    approx: 'approx',
    credits: 'Credits',
    creditsPerMonth: 'Credits / Month',
    entries: 'entries',
    messages: 'messages',
    month: 'month',
    oneTime: 'one time',
    perCredit: '/ Credit',
    perMillionCredits: '/ 1M Credits',
  },
  usage: {
    detail: 'Computing Credits Usage Details',
    fileStorage: 'File Storage',
    onDemand: 'On-demand',
    overview: 'Usage Overview',
    planUsage: 'Plan Usage',
    thisMonth: 'This Month Usage',
    tokenUsage: 'Token Usage',
    vectorStorage: 'Vector Storage',
  },
};

const zhCopy: typeof enCopy = {
  actions: {
    bind: '确认绑定',
    changePlan: '调整套餐',
    copy: '复制',
    copyLink: '复制链接',
    currentPlan: '当前套餐',
    getStarted: '开始使用',
    purchase: '购买',
    purchaseNow: '立即购买',
    save: '保存',
    viewBilling: '查看账单',
  },
  billing: {
    amount: '金额',
    billingCycle: '预付周期',
    billingHistory: '账单记录',
    billingSummary: '账单概览',
    currentPlan: '当前套餐',
    endDate: '付费权益到期',
    intervalFallback: '每月',
    manualRenewal: '到期后手动续费，不会自动扣款',
    noScheduledTerms: '当前没有已排期的预付条款',
    orderNumber: '订单号',
    paymentDate: '付款时间',
    paymentGateway: '支付渠道',
    renewalMode: '续费方式',
    scheduledTerms: '已排期条款',
    startDate: '付费权益开始',
    status: '状态',
    transactionStatus: '交易状态',
  },
  credits: {
    autoTopup: '自动充值',
    autoTopupNoPayment: '当前没有可用支付方式。添加支付方式前，自动充值会保持影子模式安全状态。',
    autoTopupSaved: '自动充值设置已保存',
    balance: '余额',
    currentPlan: '当前套餐',
    disabled: '已关闭',
    enabled: '已开启',
    expiresAt: '过期时间',
    freeNeedsPaidPlan: '免费用户需要先订阅付费套餐，才能购买充值积分。',
    monthlyLimit: '月度限额',
    myPackages: '我的积分包',
    noPacks: '当前没有可购买的积分包。',
    noPackages: '暂无积分包',
    purchaseCredits: '购买积分',
    purchasedOn: '购买时间',
    source: '来源',
    status: '状态',
    subscriptionCredits: '订阅积分',
    targetBalance: '目标余额',
    threshold: '触发阈值',
    topupBalance: '充值积分余额',
    unitPriceFallback: '单价以本地目录为准',
    validityMonths: '个月有效期',
  },
  errors: {
    bindFailed: '绑定失败',
    checkoutFailed: '结算失败',
    saveAutoTopupFailed: '保存自动充值设置失败',
    sessionUnavailable: 'LobeHub 账单会话不可用，请重新登录 AskCore。',
    updateFailed: '更新失败',
  },
  messages: {
    bindSuccess: '邀请码绑定成功',
    copied: '已复制',
    referralSaved: '推荐码已保存',
  },
  payment: {
    close: '取消支付',
    closed: '订单已关闭',
    expiresAt: '过期时间',
    failed: '支付失败',
    pollFailed: '无法刷新支付状态',
    returnError: '无法刷新支付结果。',
    returnTitle: '支付状态',
    refunded: '已退款',
    scanHint: '请使用微信扫一扫完成支付。',
    succeeded: '支付完成',
    title: '微信支付',
    waiting: '等待支付',
    wechatUnavailable: '微信支付尚未为当前账号启用。',
  },
  page: {
    subtitle: '用量、固定预付条款、积分、账单与推荐奖励。',
    titles: {
      billing: '账单',
      credits: '积分',
      notification: '通知',
      plans: '套餐',
      referral: '推荐奖励',
      usage: '用量',
    },
  },
  plans: {
    available: '可用',
    comparison: '套餐对比',
    currentPlan: '当前套餐',
    detailPayOnce: '一次性付款',
    detailYearly: '每年',
    faq: '常见问题',
    faqRenewalAnswer:
      '每次购买都是固定期限的预付条款，可在到期前后手动续费；AskCore 不会自动扣款。',
    faqRenewalQuestion: '付费条款如何续费？',
    fileStorage: '文件存储',
    noProvider: '当前未启用支付渠道。',
    perMonth: '每月',
    perMonthBilledYearly: '每月，按年支付',
    planPricing: '套餐与价格',
    pricingSubtitle: '使用 AskCore 本地账单，无官方云依赖。',
    supportFallback: '社区支持',
    textModelPricing: '文本模型价格',
    vectorStorage: '向量存储',
  },
  periods: {
    monthly: '按月',
    oneTime: '一次性',
    yearly: '按年',
    yearlyOff: '优惠',
  },
  intervals: {
    monthly: '每月',
    oneTime: '一次性',
    yearly: '每年',
  },
  referral: {
    availableBalance: '可用余额',
    backfillDescription: '忘记填写邀请码？可在奖励过期前在这里绑定。',
    backfillTitle: '补填邀请码',
    codeDescription: '分享你的专属推荐码，邀请好友注册。',
    codePattern: '请输入 2-8 位字母、数字或下划线',
    codeTitle: '我的推荐码',
    history: '推荐记录',
    inviteeEmail: '被邀请人邮箱',
    linkDescription: '复制链接并分享给好友，完成注册即可获得奖励。',
    linkTitle: '推荐链接',
    myReward: '我的奖励',
    noHistory: '暂无推荐记录',
    notEnabled: '推荐奖励当前未启用。',
    placeholder: '请输入邀请码或链接',
    programRules: '计划规则',
    registrationTime: '注册时间',
    rules: {
      expiry: '积分有效期：推荐奖励积分将在 {{days}} 天后过期。',
      priority: '扣减优先级：免费积分、订阅积分、推荐奖励积分、充值积分。',
      registration: '注册方式：被邀请用户通过推荐链接注册或在注册页输入推荐码',
      reward: '奖励：邀请人和被邀请人各获得 {{reward}}',
      rewardDelay: '奖励处理：积分将在审核通过后发放，最多需要 {{hours}} 小时',
      validAction: '有效动作：{{action}}',
      validActions: {
        firstBillableUsage: '首次产生可计费用量',
      },
    },
    status: '状态',
    totalInvites: '邀请总数',
    validConversions: '有效转化',
  },
  statuses: {
    active: '有效',
    canceled: '已取消',
    cancelled: '已取消',
    canary: '灰度模式',
    enforce: '正式模式',
    free: '免费版',
    paid: '已支付',
    pending: '处理中',
    pending_reward: '审核中',
    processing: '处理中',
    registered: '已注册',
    revoked: '已撤销',
    rewarded: '已奖励',
    shadow: '影子模式',
    suspected: '待核查',
    trialing: '试用中',
    unpaid: '未支付',
  },
  tables: {
    createdAt: '创建时间',
    credits: '积分',
    inputTokens: '输入 100 万 Token',
    model: '模型',
    outputTokens: '输出 100 万 Token',
    provider: '提供商',
    tokenUsage: 'Token 用量',
    trigger: '触发来源',
    type: '类型',
  },
  units: {
    approx: '约',
    credits: '积分',
    creditsPerMonth: '积分 / 月',
    entries: '条目',
    messages: '条消息',
    month: '月',
    oneTime: '一次性',
    perCredit: '/ 积分',
    perMillionCredits: '/ 100 万积分',
  },
  usage: {
    detail: '算力积分用量明细',
    fileStorage: '文件存储',
    onDemand: '按需用量',
    overview: '用量概览',
    planUsage: '套餐用量',
    thisMonth: '本月用量',
    tokenUsage: 'Token 用量',
    vectorStorage: '向量存储',
  },
};

type BillingCopy = typeof enCopy;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const REFERRAL_REWARD_TEMPLATE_TOKEN = '__ASKCORE_REFERRAL_REWARD__';
const REFERRAL_DAYS_TEMPLATE_TOKEN = '__ASKCORE_REFERRAL_DAYS__';
const REFERRAL_HOURS_TEMPLATE_TOKEN = '__ASKCORE_REFERRAL_HOURS__';
const REFERRAL_ACTION_TEMPLATE_TOKEN = '__ASKCORE_REFERRAL_ACTION__';

export const getBillingCopy = (language?: string): BillingCopy =>
  isChineseLanguage(language) ? zhCopy : enCopy;

const translatedCopy = (
  t: TranslateFn,
  key: string,
  defaultValue: string,
  options: Record<string, unknown> = {},
) => t(key, { ...options, defaultValue });

export const createLocalizedBillingCopy = (
  language: string | undefined,
  t: TranslateFn,
): BillingCopy => {
  const base = getBillingCopy(language);
  const shortInterval =
    isChineseLanguage(language) || language?.toLowerCase().startsWith('en') || !language;
  const monthlyInterval = shortInterval
    ? base.intervals.monthly
    : translatedCopy(t, 'recurring.monthly', base.intervals.monthly);
  const oneTimeInterval = shortInterval
    ? base.intervals.oneTime
    : translatedCopy(t, 'recurring.payonce', base.intervals.oneTime);
  const yearlyInterval = shortInterval
    ? base.intervals.yearly
    : translatedCopy(t, 'recurring.yearly', base.intervals.yearly);

  return {
    ...base,
    billing: {
      ...base.billing,
      billingCycle: translatedCopy(
        t,
        'askcoreBilling.billing.prepaidTerm',
        base.billing.billingCycle,
      ),
      endDate: translatedCopy(t, 'askcoreBilling.billing.endDate', base.billing.endDate),
      intervalFallback: monthlyInterval,
      manualRenewal: translatedCopy(
        t,
        'askcoreBilling.billing.manualRenewal',
        base.billing.manualRenewal,
      ),
      noScheduledTerms: translatedCopy(
        t,
        'askcoreBilling.billing.noScheduledTerms',
        base.billing.noScheduledTerms,
      ),
      renewalMode: translatedCopy(
        t,
        'askcoreBilling.billing.renewalMode',
        base.billing.renewalMode,
      ),
      scheduledTerms: translatedCopy(
        t,
        'askcoreBilling.billing.scheduledTerms',
        base.billing.scheduledTerms,
      ),
      startDate: translatedCopy(t, 'askcoreBilling.billing.startDate', base.billing.startDate),
    },
    intervals: {
      ...base.intervals,
      monthly: monthlyInterval,
      oneTime: oneTimeInterval,
      yearly: yearlyInterval,
    },
    periods: {
      ...base.periods,
      monthly: translatedCopy(t, 'plans.navs.monthly', base.periods.monthly),
      oneTime: translatedCopy(t, 'plans.navs.payonce', base.periods.oneTime),
      yearly: translatedCopy(t, 'plans.navs.yearly', base.periods.yearly),
    },
    page: {
      ...base.page,
      subtitle: translatedCopy(t, 'askcoreBilling.page.subtitle', base.page.subtitle),
    },
    plans: {
      ...base.plans,
      faqRenewalAnswer: translatedCopy(
        t,
        'askcoreBilling.faq.renewalAnswer',
        base.plans.faqRenewalAnswer,
      ),
      faqRenewalQuestion: translatedCopy(
        t,
        'askcoreBilling.faq.renewalQuestion',
        base.plans.faqRenewalQuestion,
      ),
    },
    referral: {
      ...base.referral,
      programRules: translatedCopy(t, 'referral.rules.title', base.referral.programRules),
      rules: {
        ...base.referral.rules,
        expiry: translatedCopy(t, 'referral.rules.expiry', base.referral.rules.expiry, {
          days: REFERRAL_DAYS_TEMPLATE_TOKEN,
        }).replaceAll(REFERRAL_DAYS_TEMPLATE_TOKEN, '{{days}}'),
        priority: translatedCopy(t, 'referral.rules.priority', base.referral.rules.priority),
        registration: translatedCopy(
          t,
          'referral.rules.registration',
          base.referral.rules.registration,
        ),
        reward: translatedCopy(t, 'referral.rules.reward', base.referral.rules.reward, {
          reward: REFERRAL_REWARD_TEMPLATE_TOKEN,
        }).replaceAll(REFERRAL_REWARD_TEMPLATE_TOKEN, '{{reward}}'),
        rewardDelay: translatedCopy(
          t,
          'referral.rules.rewardDelay',
          base.referral.rules.rewardDelay,
          { hours: REFERRAL_HOURS_TEMPLATE_TOKEN },
        ).replaceAll(REFERRAL_HOURS_TEMPLATE_TOKEN, '{{hours}}'),
        validAction: translatedCopy(
          t,
          'referral.rules.validAction',
          base.referral.rules.validAction,
          { action: REFERRAL_ACTION_TEMPLATE_TOKEN },
        ).replaceAll(REFERRAL_ACTION_TEMPLATE_TOKEN, '{{action}}'),
        validActions: {
          ...base.referral.rules.validActions,
          firstBillableUsage: translatedCopy(
            t,
            'referral.rules.validActions.firstBillableUsage',
            base.referral.rules.validActions.firstBillableUsage,
          ),
        },
      },
    },
    statuses: {
      ...base.statuses,
      pending_reward: translatedCopy(
        t,
        'referral.table.status.pending_reward',
        base.statuses.pending_reward,
      ),
      registered: translatedCopy(t, 'referral.table.status.registered', base.statuses.registered),
      revoked: translatedCopy(t, 'referral.table.status.revoked', base.statuses.revoked),
      rewarded: translatedCopy(t, 'referral.table.status.rewarded', base.statuses.rewarded),
      suspected: translatedCopy(t, 'referral.table.status.suspected', base.statuses.suspected),
    },
  };
};

export const formatBillingInterval = (
  value: string | null | undefined,
  copy: BillingCopy,
): string => {
  if (!value) return copy.billing.intervalFallback;
  const normalized = value.toLowerCase().replaceAll(/[\s_-]/g, '');
  if (normalized === 'month' || normalized === 'monthly') return copy.intervals.monthly;
  if (
    normalized === 'year' ||
    normalized === 'yearly' ||
    normalized === 'annual' ||
    normalized === 'annually'
  )
    return copy.intervals.yearly;
  if (normalized === 'payonce' || normalized === 'once' || normalized === 'onetime')
    return copy.intervals.oneTime;
  return value;
};

export const formatBillingStatus = (
  value: string | null | undefined,
  copy: BillingCopy,
): string => {
  if (!value) return '-';
  const normalized = value.toLowerCase().replaceAll('-', '_') as keyof BillingCopy['statuses'];
  return copy.statuses[normalized] || value;
};

export const formatPersonalRenewalMode = (
  value: string | null | undefined,
  copy: BillingCopy,
): string => (value === 'manual' ? copy.billing.manualRenewal : '-');

const applyCopyTemplate = (template: string, values: Record<string, string>) =>
  template.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] || '');

const formatReferralValidAction = (
  value: string | number | undefined,
  copy: BillingCopy,
) => {
  const normalized = String(value || '').trim();
  if (normalized === 'first_billable_usage') {
    return copy.referral.rules.validActions.firstBillableUsage;
  }
  return normalized || '-';
};

export const localizeReferralRules = (
  rules: Record<string, string | number> | undefined,
  rewardCredits: number | null | undefined,
  copy: BillingCopy,
) => {
  const knownRules = new Set<string>();
  const rawEntries = Object.entries(rules || {});
  const normalizedRuleValue = (id: string) => {
    const entry = rawEntries.find(([key]) => key.toLowerCase().replaceAll(/[\s_-]/g, '') === id);
    if (entry) knownRules.add(entry[0]);
    return entry?.[1];
  };

  const localized = [
    { id: 'registration', text: copy.referral.rules.registration },
    {
      id: 'reward',
      text: applyCopyTemplate(copy.referral.rules.reward, {
        reward: formatCredits(rewardCredits, copy),
      }),
    },
    {
      id: 'rewarddelayhours',
      text: applyCopyTemplate(copy.referral.rules.rewardDelay, {
        hours: String(normalizedRuleValue('rewarddelayhours') || 6),
      }),
    },
    {
      id: 'expirydays',
      text: applyCopyTemplate(copy.referral.rules.expiry, {
        days: String(normalizedRuleValue('expirydays') || 0),
      }),
    },
    { id: 'priority', text: copy.referral.rules.priority },
    {
      id: 'validaction',
      text: applyCopyTemplate(copy.referral.rules.validAction, {
        action: formatReferralValidAction(normalizedRuleValue('validaction'), copy),
      }),
    },
  ];
  const result = localized.filter((item) => {
    const hasRule =
      rawEntries.length === 0 ||
      rawEntries.some(([key]) => {
        const normalized = key.toLowerCase().replaceAll(/[\s_-]/g, '');
        if (normalized === item.id.toLowerCase()) {
          knownRules.add(key);
          return true;
        }
        return false;
      });
    return hasRule;
  });

  for (const [key, value] of rawEntries) {
    if (!knownRules.has(key) && key.startsWith('rule_')) {
      result.push({ id: key, text: String(value) });
    }
  }

  return result;
};

const styles = createStaticStyles(({ css }) => ({
  cardGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  `,
  compareCell: css`
    min-width: 140px;
  `,
  header: css`
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  `,
  metricGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  `,
  page: css`
    overflow: auto;

    width: 100%;
    min-height: 100%;
    padding: 24px;

    background: ${cssVar.colorBgLayout};
  `,
  pageInner: css`
    width: min(1180px, 100%);
    margin-block: 0;
    margin-inline: auto;
  `,
  planCard: css`
    height: 100%;
    border-radius: 8px;

    .ant-card-body {
      display: flex;
      height: 100%;
    }
  `,
  planCardContent: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 100%;
  `,
  planActionButton: css`
    height: 40px;
  `,
  planActionSlot: css`
    margin-block-start: auto;
    padding-block-start: 12px;
  `,
  currentPlanActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `,
  currentPlanCard: css`
    border-radius: 8px;

    .ant-card-body {
      padding-block: 16px;
    }
  `,
  planFeatures: css`
    margin: 0;
    padding-inline-start: 18px;
    line-height: 1.75;
    color: ${cssVar.colorTextSecondary};
  `,
  price: css`
    font-size: 30px;
    font-weight: 700;
    line-height: 1;
  `,
  section: css`
    border-radius: 8px;
  `,
  subtle: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

export const isAskCoreBillingPageKey = (value: unknown): value is AskCoreBillingPageKey =>
  ASKCORE_BILLING_PAGE_KEYS.includes(value as AskCoreBillingPageKey);

export const normalizeBillingPath = (path: string, options: { publicEndpoint?: boolean } = {}) => {
  if (path.startsWith('/api/')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = options.publicEndpoint ? '/api/billing/v1' : '/api/askcore/billing';
  return `${prefix}${normalizedPath}`;
};

const billingFetch = async (
  path: string,
  init: RequestInit = {},
  options: { publicEndpoint?: boolean } = {},
) => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(normalizeBillingPath(path, options), {
    ...init,
    credentials: 'include',
    headers,
  });
};

const billingJson = async <T,>(
  path: string,
  init: RequestInit = {},
  options: { publicEndpoint?: boolean } = {},
): Promise<T> => {
  const response = await billingFetch(path, init, options);
  if (!response.ok) {
    if (response.status === 401 && !options.publicEndpoint) {
      throw new Error(enCopy.errors.sessionUnavailable);
    }
    const body = await response.text().catch(() => '');
    let detail = body;
    try {
      const json = JSON.parse(body) as { detail?: unknown; message?: unknown };
      const parsedDetail = typeof json.detail === 'string' ? json.detail : json.message;
      if (typeof parsedDetail === 'string' && parsedDetail) detail = parsedDetail;
    } catch {
      detail = body;
    }
    throw new Error(detail || `Billing request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const useBillingJson = <T,>(path: string | null, publicEndpoint = false, refreshKey = 0) => {
  const [state, setState] = useState<ResourceState<T>>({ loading: Boolean(path) });

  useEffect(() => {
    if (!path) {
      setState({ loading: false });
      return;
    }

    let mounted = true;
    setState((previous) => ({ data: previous.data, loading: true }));
    billingJson<T>(path, {}, { publicEndpoint })
      .then((data) => {
        if (mounted) setState({ data, loading: false });
      })
      .catch((error: Error) => {
        if (mounted) setState({ error: error.message, loading: false });
      });

    return () => {
      mounted = false;
    };
  }, [path, publicEndpoint, refreshKey]);

  return state;
};

export const normalizePlansPayload = (payload: Partial<AskCorePlansPayload> | undefined) => ({
  billingPeriods: Array.isArray(payload?.billing_periods) ? payload.billing_periods : [],
  creditPacks: Array.isArray(payload?.credit_packs) ? payload.credit_packs : [],
  plans: Array.isArray(payload?.plans) ? payload.plans : [],
});

export const resolveDefaultProvider = (
  providers?: AskCorePlansPayload['providers'],
  options: { isChinese?: boolean } = {},
): BillingProvider | null => {
  const candidates: BillingProvider[] = options.isChinese ? ['alipay', 'wechat'] : ['stripe'];
  return (
    candidates.find((provider) => {
      const config = providers?.[provider];
      return Boolean(config?.enabled) && config?.checkout_available !== false;
    }) || null
  );
};

export const isWechatQrCheckout = (checkout?: CheckoutResponse | null) =>
  checkout?.provider === 'wechat' &&
  checkout.checkout_type === 'qrcode' &&
  Boolean(checkout.code_url);

const terminalPaymentStatuses = new Set(['closed', 'failed', 'refunded', 'shadow', 'succeeded']);

const isTerminalPaymentStatus = (status: string | null | undefined) =>
  terminalPaymentStatuses.has(String(status || '').toLowerCase());

export const buildAskCoreBillingEmbedUrl = ({
  language,
  origin,
  page,
  checkoutId,
}: {
  checkoutId?: string;
  language?: string;
  origin: string;
  page: AskCoreBillingPageKey;
}) => {
  const rawBase = process.env.NEXT_PUBLIC_ASKCORE_BILLING_EMBED_URL?.trim();
  const base = rawBase ? new URL(rawBase, origin) : new URL(origin);
  const basePath = base.pathname.replace(/\/+$/, '');
  const embedPath = basePath.endsWith('/embed/subscription')
    ? `${basePath}/${page}`
    : `/embed/subscription/${page}`;

  base.pathname = embedPath;
  base.search = '';
  base.hash = '';
  if (language) base.searchParams.set('hl', language);
  if (checkoutId) base.searchParams.set('p33_checkout', checkoutId);
  return base.toString();
};

const paymentHostSuffixes = [
  'alipay.com',
  'alipayobjects.com',
  'stripe.com',
  'tenpay.com',
  'wechat.com',
  'weixin.qq.com',
];

const hostMatchesSuffix = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

export const isAllowedBillingExternalUrl = (
  rawUrl: string,
  { appOrigin, embedOrigin }: { appOrigin: string; embedOrigin: string },
) => {
  try {
    const url = new URL(rawUrl, appOrigin);
    if (url.origin === appOrigin || url.origin === embedOrigin) return true;
    return paymentHostSuffixes.some((suffix) => hostMatchesSuffix(url.hostname, suffix));
  } catch {
    return false;
  }
};

const requestParentOpenUrl = (url: string) => {
  if (typeof window === 'undefined') return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: ASKCORE_BILLING_OPEN_URL_MESSAGE, url }, '*');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

const WECHAT_PAYMENT_POLL_INTERVAL_MS = 2500;
const PAYMENT_RETURN_POLL_INTERVAL_MS = 2500;

const paymentStatusText = (status: string | null | undefined, copy: BillingCopy) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded') return copy.payment.succeeded;
  if (normalized === 'closed') return copy.payment.closed;
  if (normalized === 'failed') return copy.payment.failed;
  if (normalized === 'refunded') return copy.payment.refunded;
  return copy.payment.waiting;
};

const closePaymentPath = (checkout: CheckoutResponse) =>
  `${(checkout.poll_url || `/payments/${checkout.checkout_id}`).replace(/\/$/, '')}/close`;

const WechatCheckoutModal = memo<{
  checkout: CheckoutResponse | null;
  copy: BillingCopy;
  onClose: () => void;
  onSuccess: () => void;
}>(({ checkout, copy, onClose, onSuccess }) => {
  const [pollError, setPollError] = useState<string | null>(null);
  const [status, setStatus] = useState(checkout?.status || 'pending');
  const reportedSuccessRef = useRef<string | null>(null);
  const open = isWechatQrCheckout(checkout);

  useEffect(() => {
    setPollError(null);
    setStatus(checkout?.status || 'pending');
    reportedSuccessRef.current = null;
  }, [checkout?.checkout_id, checkout?.status]);

  useEffect(() => {
    if (!checkout || !isWechatQrCheckout(checkout)) return;

    let closed = false;
    let timer: number | undefined;
    const pollPath = checkout.poll_url || `/payments/${checkout.checkout_id}`;

    const poll = async () => {
      try {
        const next = await billingJson<CheckoutResponse>(pollPath);
        if (closed) return;
        setPollError(null);
        setStatus(next.status);
        if (next.status === 'succeeded' && reportedSuccessRef.current !== checkout.checkout_id) {
          reportedSuccessRef.current = checkout.checkout_id;
          message.success(copy.payment.succeeded);
          onSuccess();
        }
        if (!isTerminalPaymentStatus(next.status)) {
          timer = window.setTimeout(poll, WECHAT_PAYMENT_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (closed) return;
        setPollError(error instanceof Error ? error.message : copy.payment.pollFailed);
        timer = window.setTimeout(poll, WECHAT_PAYMENT_POLL_INTERVAL_MS);
      }
    };

    if (!isTerminalPaymentStatus(checkout.status)) {
      timer = window.setTimeout(poll, WECHAT_PAYMENT_POLL_INTERVAL_MS);
    }

    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkout, copy.payment.pollFailed, copy.payment.succeeded, onSuccess]);

  const handleClose = useCallback(async () => {
    if (checkout && !isTerminalPaymentStatus(status)) {
      await billingFetch(closePaymentPath(checkout), { method: 'POST' }).catch(() => undefined);
    }
    onClose();
  }, [checkout, onClose, status]);

  return (
    <Modal
      open={open}
      title={copy.payment.title}
      footer={
        <Button
          type={isTerminalPaymentStatus(status) ? 'primary' : 'default'}
          onClick={handleClose}
        >
          {copy.payment.close}
        </Button>
      }
      onCancel={handleClose}
    >
      <Flexbox align={'center'} gap={12}>
        <QRCode size={220} value={checkout?.code_url || ' '} />
        <Text type={'secondary'}>{copy.payment.scanHint}</Text>
        <Text strong>{checkout?.amount?.display}</Text>
        <Badge
          status={status === 'succeeded' ? 'success' : 'processing'}
          text={paymentStatusText(status, copy)}
        />
        {checkout?.expires_at && (
          <Text type={'secondary'}>
            {copy.payment.expiresAt}: {formatDate(checkout.expires_at)}
          </Text>
        )}
        {pollError && (
          <Alert showIcon message={pollError || copy.payment.pollFailed} type="warning" />
        )}
      </Flexbox>
    </Modal>
  );
});

WechatCheckoutModal.displayName = 'WechatCheckoutModal';

const paymentAlertType = (
  status: string | null | undefined,
): 'error' | 'info' | 'success' | 'warning' => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded') return 'success';
  if (normalized === 'failed') return 'error';
  if (normalized === 'closed' || normalized === 'refunded') return 'warning';
  return 'info';
};

const PaymentReturnAlert = memo<{
  copy: BillingCopy;
  onSuccess: () => void;
}>(({ copy, onSuccess }) => {
  const checkoutId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('p33_checkout') || '';
  }, []);
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportedSuccessRef = useRef<string | null>(null);

  useEffect(() => {
    if (!checkoutId) return;

    let closed = false;
    let timer: number | undefined;
    const pollPath = `/payments/${encodeURIComponent(checkoutId)}`;

    const poll = async () => {
      try {
        const next = await billingJson<CheckoutResponse>(pollPath);
        if (closed) return;
        setCheckout(next);
        setError(null);
        if (next.status === 'succeeded' && reportedSuccessRef.current !== checkoutId) {
          reportedSuccessRef.current = checkoutId;
          onSuccess();
        }
        if (!isTerminalPaymentStatus(next.status)) {
          timer = window.setTimeout(poll, PAYMENT_RETURN_POLL_INTERVAL_MS);
        }
      } catch (pollError) {
        if (closed) return;
        setError(pollError instanceof Error ? pollError.message : copy.payment.returnError);
        timer = window.setTimeout(poll, PAYMENT_RETURN_POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkoutId, copy.payment.returnError, onSuccess]);

  if (!checkoutId) return null;

  if (error && !checkout) {
    return <Alert showIcon message={error} type="warning" />;
  }

  return (
    <Alert
      showIcon
      title={copy.payment.returnTitle}
      type={paymentAlertType(checkout?.status)}
      description={
        checkout?.amount?.display
          ? `${paymentStatusText(checkout.status, copy)} · ${checkout.amount.display}`
          : paymentStatusText(checkout?.status, copy)
      }
    />
  );
});

PaymentReturnAlert.displayName = 'PaymentReturnAlert';

const formatCredits = (value: number | null | undefined, copy: BillingCopy) =>
  `${compactNumberFormatter.format(Number(value || 0))} ${copy.units.credits}`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const localPlanName = (plan: AskCoreBillingPlan | undefined, isChinese: boolean) =>
  (isChinese ? plan?.display_name_zh : plan?.display_name) || plan?.display_name || '';

const localPlanDescription = (plan: AskCoreBillingPlan | undefined, isChinese: boolean) =>
  (isChinese ? plan?.description_zh : plan?.description) || plan?.description || '';

const localPlanSupport = (plan: AskCoreBillingPlan, isChinese: boolean, copy: BillingCopy) =>
  (isChinese ? plan.support_zh : plan.support) || plan.support || copy.plans.supportFallback;

const localPlanBadge = (plan: AskCoreBillingPlan, isChinese: boolean) =>
  (isChinese ? plan.badge_zh : plan.badge) || plan.badge;

const localPackName = (pack: AskCoreCreditPack, isChinese: boolean) =>
  (isChinese ? pack.display_name_zh : pack.display_name) || pack.display_name;

const moneyValue = (
  usdValue: number | null | undefined,
  cnyValue: number | null | undefined,
  isChinese: boolean,
) => Number((isChinese ? cnyValue : usdValue) ?? usdValue ?? cnyValue ?? 0);

export const formatPlanTopupUnitPrice = (
  plan: Pick<AskCoreBillingPlan, 'topup_unit_price_cny' | 'topup_unit_price_usd'>,
  isChinese: boolean,
  copy: BillingCopy,
) => {
  const unitPrice = moneyValue(plan.topup_unit_price_usd, plan.topup_unit_price_cny, isChinese);
  return unitPrice
    ? `${createMoneyFormatter(isChinese).format(unitPrice)} ${copy.units.perCredit}`
    : copy.credits.unitPriceFallback;
};

const planPrice = (
  plan: AskCoreBillingPlan,
  period: BillingPeriodId,
  isChinese: boolean,
  copy: BillingCopy,
  moneyFormatter: Intl.NumberFormat,
) => {
  const yearlyMonthlyPrice = moneyValue(
    plan.yearly_monthly_price_usd,
    plan.yearly_monthly_price_cny,
    isChinese,
  );
  const yearlyPrice = moneyValue(plan.yearly_price_usd, plan.yearly_price_cny, isChinese);
  const yearlyAvailable =
    (isChinese ? plan.yearly_monthly_price_cny : plan.yearly_monthly_price_usd) !== undefined &&
    (isChinese ? plan.yearly_monthly_price_cny : plan.yearly_monthly_price_usd) !== null;
  if (period === 'yearly' && yearlyAvailable) {
    return {
      detail: yearlyPrice
        ? `${moneyFormatter.format(yearlyPrice)} / ${copy.plans.detailYearly}`
        : '',
      price: yearlyMonthlyPrice,
      suffix: copy.plans.perMonthBilledYearly,
    };
  }
  const oneTimeAvailable =
    (isChinese ? plan.one_time_price_cny : plan.one_time_price_usd) !== undefined &&
    (isChinese ? plan.one_time_price_cny : plan.one_time_price_usd) !== null;
  if (period === 'payonce' && oneTimeAvailable) {
    return {
      detail: copy.plans.detailPayOnce,
      price: moneyValue(plan.one_time_price_usd, plan.one_time_price_cny, isChinese),
      suffix: copy.units.oneTime,
    };
  }
  return {
    detail: '',
    price: moneyValue(plan.monthly_price_usd, plan.monthly_price_cny, isChinese),
    suffix: copy.plans.perMonth,
  };
};

const pageTitle = (page: AskCoreBillingPageKey, copy: BillingCopy) => copy.page.titles[page];

const comparisonTitle = (group: PlanComparisonGroup, isChinese: boolean) => {
  if (!isChinese) return group.title;
  if (group.key === 'credits') return '算力积分';
  if (group.key === 'knowledge') return '文件与知识库';
  if (group.key === 'support') return '服务支持';
  return group.title;
};

const comparisonRowLabel = (label: string, isChinese: boolean) => {
  if (!isChinese) return label;
  const labels: Record<string, string> = {
    'File Storage': '文件存储',
    'Monthly credit usage': '每月积分额度',
    'Support Channels': '支持渠道',
    'Top up Credits': '充值积分',
    'Vector Storage': '向量存储',
  };
  return labels[label] || label;
};

const comparisonUnit = (unit: string | undefined, isChinese: boolean) => {
  if (!unit || !isChinese) return unit;
  const units: Record<string, string> = {
    'approx messages': '条消息',
    'credits / month': '积分 / 月',
    'entries': '条目',
  };
  return units[unit] || unit;
};

const localizedFaq = (
  items: AskCorePlansPayload['faq'] | undefined,
  isChinese: boolean,
  copy: BillingCopy,
): { answer: string; question: string }[] => {
  if (!isChinese) {
    return items?.length
      ? items.map((item) => {
          const isRenewalItem =
            /renew|fixed prepaid term|automatic charge|customer portal|cancel (?:my )?subscription/i.test(
              `${item.question} ${item.answer}`,
            );
          if (isRenewalItem) {
            return {
              question: copy.plans.faqRenewalQuestion,
              answer: copy.plans.faqRenewalAnswer,
            };
          }
          return {
            ...item,
            answer: item.answer.replace(
              /organization.*?personal credits\.?/i,
              'This page currently shows personal plans and personal credits.',
            ),
          };
        })
      : [
          {
            question: 'What are credits?',
            answer:
              'Credits measure model usage. Text, image, voice, and embedding models consume credits at different rates.',
          },
          {
            question: 'What happens when credits run out?',
            answer:
              'You can change plans or purchase credit packs. This page currently shows personal plans and personal credits.',
          },
          {
            question: copy.plans.faqRenewalQuestion,
            answer: copy.plans.faqRenewalAnswer,
          },
          {
            question: 'Which plans are available?',
            answer:
              'The local AskCore catalog shows enabled plans. Prices and quotas on this page are the source of truth.',
          },
        ];
  }
  return [
    {
      question: '什么是算力积分？',
      answer: '积分用于衡量模型用量。不同文本、图像、语音和向量模型会按不同费率消耗积分。',
    },
    {
      question: '积分用完后怎么办？',
      answer: '可以升级套餐或购买积分包。本轮付费页只展示个人套餐与个人积分。',
    },
    {
      question: copy.plans.faqRenewalQuestion,
      answer: copy.plans.faqRenewalAnswer,
    },
    {
      question: '当前有哪些套餐？',
      answer: '本地 AskCore 目录会展示当前启用的套餐，具体价格和额度以本页为准。',
    },
  ];
};

const PageHeader = memo<{
  account?: AskCoreAccountPayload;
  copy: BillingCopy;
  page: AskCoreBillingPageKey;
  plansPayload?: AskCorePlansPayload;
}>(({ account, copy, page, plansPayload }) => {
  const mode = account?.mode || plansPayload?.mode;

  return (
    <Flexbox horizontal className={styles.header}>
      <Flexbox gap={8}>
        <Flexbox horizontal align={'center'} gap={10}>
          <ProductLogo size={26} />
          <Text as={'h2'} style={{ fontSize: 22, fontWeight: 650, margin: 0 }}>
            {pageTitle(page, copy)}
          </Text>
        </Flexbox>
        <Text type={'secondary'}>{copy.page.subtitle}</Text>
      </Flexbox>
      {mode && (
        <Tag color={mode === 'enforce' ? 'green' : 'blue'}>{formatBillingStatus(mode, copy)}</Tag>
      )}
    </Flexbox>
  );
});

PageHeader.displayName = 'PageHeader';

const navigateSubscriptionEmbedPage = (page: AskCoreBillingPageKey) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = `/embed/subscription/${page}`;
  window.location.assign(url.toString());
};

const CurrentPlanCard = memo<{
  account?: AskCoreAccountPayload;
  copy: BillingCopy;
  isChinese: boolean;
  onBrowsePlans: () => void;
  plans: AskCoreBillingPlan[];
}>(({ account, copy, isChinese, onBrowsePlans, plans }) => {
  const planId = account?.personal.plan_id || 'free';
  const plan = plans.find((item) => item.id === planId);

  return (
    <Card className={styles.currentPlanCard} title={copy.plans.currentPlan}>
      <Flexbox gap={10}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Flexbox horizontal align={'center'} gap={10}>
            <Icon icon={Sparkles} />
            <Text style={{ fontSize: 18, fontWeight: 650 }}>
              {localPlanName(plan, isChinese) || planId}
            </Text>
          </Flexbox>
          <Badge
            status="processing"
            text={formatBillingStatus(account?.personal.subscription_status || 'free', copy)}
          />
        </Flexbox>
        <Text type={'secondary'}>
          {localPlanDescription(plan, isChinese) || copy.plans.pricingSubtitle}
        </Text>
        <Progress
          showInfo={false}
          percent={Math.min(
            100,
            Math.round(
              ((Number(account?.personal.balance_credits || 0) || 0) /
                Math.max(Number(plan?.monthly_credits || 1), 1)) *
                100,
            ),
          )}
        />
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>
            {formatCredits(account?.personal.balance_credits, copy)} {copy.plans.available}
          </Text>
          <Text type={'secondary'}>
            {formatCredits(plan?.monthly_credits, copy)} / {copy.units.month}
          </Text>
        </Flexbox>
        <div className={styles.currentPlanActions}>
          <Button size="small" type="primary" onClick={onBrowsePlans}>
            {copy.actions.changePlan}
          </Button>
          <Button size="small" onClick={() => navigateSubscriptionEmbedPage('credits')}>
            {copy.credits.purchaseCredits}
          </Button>
          <Button size="small" type="link" onClick={() => navigateSubscriptionEmbedPage('billing')}>
            {copy.actions.viewBilling}
          </Button>
        </div>
      </Flexbox>
    </Card>
  );
});

CurrentPlanCard.displayName = 'CurrentPlanCard';

export const PlansView = memo<{
  account?: AskCoreAccountPayload;
  copy: BillingCopy;
  isChinese: boolean;
  moneyFormatter: Intl.NumberFormat;
  onCheckoutSuccess: () => void;
  plansPayload?: AskCorePlansPayload;
  state: ResourceState<AskCorePlansPayload>;
}>(({ account, copy, isChinese, moneyFormatter, onCheckoutSuccess, plansPayload, state }) => {
  const { plans } = normalizePlansPayload(plansPayload);
  const [period, setPeriod] = useState<BillingPeriodId>('yearly');
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [wechatCheckout, setWechatCheckout] = useState<CheckoutResponse | null>(null);
  const currentPlanId = account?.personal?.plan_id || 'free';
  const provider = resolveDefaultProvider(plansPayload?.providers, { isChinese });
  const handleBrowsePlans = useCallback(() => {
    if (typeof document === 'undefined') return;
    document
      .getElementById('askcore-plan-pricing')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const billingPeriodOptions = useMemo(() => {
    const periods = plansPayload?.billing_periods?.length
      ? plansPayload.billing_periods
      : [
          { id: 'yearly' as const, label: copy.periods.yearly },
          { id: 'monthly' as const, label: copy.periods.monthly },
          { id: 'payonce' as const, label: copy.periods.oneTime },
        ];
    return periods.map((item) => ({
      label:
        item.id === 'yearly'
          ? `${copy.periods.yearly} ${Math.max(
              ...plans.map((plan) =>
                isChinese
                  ? plan.yearly_discount_percent_cny || 0
                  : plan.yearly_discount_percent || 0,
              ),
            )}% ${copy.periods.yearlyOff}`
          : item.id === 'monthly'
            ? copy.periods.monthly
            : item.id === 'payonce'
              ? copy.periods.oneTime
              : item.label,
      value: item.id,
    }));
  }, [copy, isChinese, plans, plansPayload?.billing_periods]);

  const handleCheckout = useCallback(
    async (plan: AskCoreBillingPlan) => {
      if (!provider) return;
      setCheckoutPlanId(plan.id);
      setCheckoutError(null);
      try {
        const checkout = await billingJson<CheckoutResponse>(
          '/checkout/subscription',
          {
            body: JSON.stringify({
              interval: period,
              plan_id: plan.id,
              provider,
              purpose: 'subscription',
              scope_type: 'user',
            }),
            method: 'POST',
          },
          {},
        );
        if (isWechatQrCheckout(checkout)) {
          setWechatCheckout(checkout);
        } else if (checkout.provider === 'wechat') {
          throw new Error(copy.payment.wechatUnavailable);
        } else {
          requestParentOpenUrl(checkout.url);
        }
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : copy.errors.checkoutFailed);
      } finally {
        setCheckoutPlanId(null);
      }
    },
    [copy.errors.checkoutFailed, copy.payment.wechatUnavailable, period, provider],
  );

  const modelColumns: ColumnsType<ModelPricingRow> = useMemo(
    () => [
      { dataIndex: 'provider', title: copy.tables.provider },
      { dataIndex: 'model', title: copy.tables.model },
      {
        dataIndex: 'input_credits_per_1m',
        render: (value: number) => formatCredits(value, copy),
        title: copy.tables.inputTokens,
      },
      {
        dataIndex: 'output_credits_per_1m',
        render: (value: number) => formatCredits(value, copy),
        title: copy.tables.outputTokens,
      },
    ],
    [copy],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (state.error) return <Alert showIcon message={state.error} type="error" />;
  if (plans.length === 0) return <Empty />;

  return (
    <Flexbox gap={16}>
      <WechatCheckoutModal
        checkout={wechatCheckout}
        copy={copy}
        onClose={() => setWechatCheckout(null)}
        onSuccess={onCheckoutSuccess}
      />
      <CurrentPlanCard
        account={account}
        copy={copy}
        isChinese={isChinese}
        plans={plans}
        onBrowsePlans={handleBrowsePlans}
      />
      {checkoutError && <Alert showIcon message={checkoutError} type="error" />}
      <Card className={styles.section} id="askcore-plan-pricing">
        <Flexbox gap={18}>
          <Flexbox horizontal align={'center'} justify={'space-between'}>
            <Flexbox gap={4}>
              <Text style={{ fontSize: 20, fontWeight: 650 }}>{copy.plans.planPricing}</Text>
              <Text type={'secondary'}>{copy.plans.pricingSubtitle}</Text>
            </Flexbox>
            <Segmented
              options={billingPeriodOptions}
              value={period}
              onChange={(value) => setPeriod(value as BillingPeriodId)}
            />
          </Flexbox>
          <div className={styles.cardGrid}>
            {plans.map((plan) => {
              const current = plan.id === currentPlanId;
              const price = planPrice(plan, period, isChinese, copy, moneyFormatter);
              const planExamples = plan.credit_examples || plan.benefits?.credits?.examples || [];
              return (
                <Card className={styles.planCard} key={plan.id}>
                  <Flexbox className={styles.planCardContent} gap={16}>
                    <Flexbox horizontal align={'flex-start'} justify={'space-between'}>
                      <Flexbox gap={4}>
                        <Flexbox horizontal align={'center'} gap={8}>
                          <Icon icon={plan.id === 'ultimate' ? ShieldCheck : Sparkles} />
                          <Text style={{ fontSize: 18, fontWeight: 650 }}>
                            {localPlanName(plan, isChinese)}
                          </Text>
                        </Flexbox>
                        <Text type={'secondary'}>{localPlanDescription(plan, isChinese)}</Text>
                      </Flexbox>
                      {localPlanBadge(plan, isChinese) && (
                        <Tag color="gold">{localPlanBadge(plan, isChinese)}</Tag>
                      )}
                    </Flexbox>
                    <Flexbox gap={4}>
                      <Flexbox horizontal align={'baseline'} gap={6}>
                        <span className={styles.price}>
                          {moneyFormatter.format(price.price || 0)}
                        </span>
                        <Text type={'secondary'}>{price.suffix}</Text>
                      </Flexbox>
                      {price.detail && <Text type={'secondary'}>{price.detail}</Text>}
                    </Flexbox>
                    <Flexbox gap={8}>
                      <Text strong>
                        {formatCredits(plan.monthly_credits, copy)} / {copy.units.month}
                      </Text>
                      {planExamples.slice(0, 3).map((example) => (
                        <Text key={example.model} type={'secondary'}>
                          {example.model}: {copy.units.approx}{' '}
                          {numberFormatter.format(example.messages || 0)} {copy.units.messages}
                        </Text>
                      ))}
                    </Flexbox>
                    <ul className={styles.planFeatures}>
                      <li>
                        {copy.plans.fileStorage}:{' '}
                        {numberFormatter.format(plan.file_storage_gb || 0)} GB
                      </li>
                      <li>
                        {copy.plans.vectorStorage}:{' '}
                        {numberFormatter.format(plan.vector_storage_entries || 0)}{' '}
                        {copy.units.entries}
                      </li>
                      <li>{localPlanSupport(plan, isChinese, copy)}</li>
                    </ul>
                    <Flexbox className={styles.planActionSlot} gap={8}>
                      <Button
                        block
                        className={styles.planActionButton}
                        disabled={current || !provider}
                        loading={checkoutPlanId === plan.id}
                        type={current ? 'default' : 'primary'}
                        onClick={() => handleCheckout(plan)}
                      >
                        {current
                          ? copy.actions.currentPlan
                          : moneyValue(
                                plan.monthly_price_usd,
                                plan.monthly_price_cny,
                                isChinese,
                              ) === 0
                            ? copy.actions.getStarted
                            : copy.actions.purchase}
                      </Button>
                      {!provider && <Text type={'secondary'}>{copy.plans.noProvider}</Text>}
                    </Flexbox>
                  </Flexbox>
                </Card>
              );
            })}
          </div>
        </Flexbox>
      </Card>
      <Card
        className={styles.section}
        title={
          <Space size={6}>
            <OpenAI size={16} />
            <span>{copy.plans.textModelPricing}</span>
          </Space>
        }
      >
        <Flexbox gap={12}>
          <Text type={'secondary'}>
            {isChinese
              ? 'AskCore 使用积分衡量 AI 模型用量，并按输入、输出 Token 分别计费。'
              : plansPayload?.model_pricing?.description}
          </Text>
          <Table
            columns={modelColumns}
            dataSource={plansPayload?.model_pricing?.text || []}
            pagination={false}
            rowKey={(row) => `${row.provider}-${row.model}`}
            size="small"
          />
        </Flexbox>
      </Card>
      <Card className={styles.section} title={copy.plans.comparison}>
        <Collapse
          defaultActiveKey={plansPayload?.plan_comparison?.map((group) => group.key)}
          items={(plansPayload?.plan_comparison || []).map((group) => ({
            children: (
              <Table
                dataSource={group.rows}
                pagination={false}
                rowKey="label"
                scroll={{ x: true }}
                size="small"
                columns={[
                  {
                    dataIndex: 'label',
                    fixed: 'left',
                    render: (value: string) => comparisonRowLabel(value, isChinese),
                    title: comparisonTitle(group, isChinese),
                    width: 220,
                  },
                  ...plans
                    .filter((plan) => plan.id !== 'free')
                    .map((plan) => ({
                      className: styles.compareCell,
                      dataIndex: plan.id,
                      render: (_: unknown, row: PlanComparisonGroup['rows'][number]) => {
                        if (row.label === 'Support Channels')
                          return localPlanSupport(plan, isChinese, copy);
                        if (row.label === 'Top up Credits') {
                          return formatPlanTopupUnitPrice(plan, isChinese, copy);
                        }
                        const value = row.values[plan.id];
                        if (typeof value === 'number') {
                          const unit = comparisonUnit(row.unit, isChinese);
                          return `${numberFormatter.format(value)}${unit ? ` ${unit}` : ''}`;
                        }
                        return value || '-';
                      },
                      title: localPlanName(plan, isChinese),
                    })),
                ]}
              />
            ),
            key: group.key,
            label: comparisonTitle(group, isChinese),
          }))}
        />
      </Card>
      <Card className={styles.section} title={copy.plans.faq}>
        <Collapse
          items={localizedFaq(plansPayload?.faq, isChinese, copy).map((item) => ({
            children: <Text type={'secondary'}>{item.answer}</Text>,
            key: item.question,
            label: item.question,
          }))}
        />
      </Card>
    </Flexbox>
  );
});

PlansView.displayName = 'PlansView';

const UsageView = memo<{
  account?: AskCoreAccountPayload;
  copy: BillingCopy;
  plansPayload?: AskCorePlansPayload;
}>(({ account, copy, plansPayload }) => {
  const state = useBillingJson<AskCoreUsagePayload>('/usage');
  const plan = plansPayload?.plans.find((item) => item.id === account?.personal.plan_id);
  const columns: ColumnsType<AskCoreUsageRow> = useMemo(
    () => [
      { dataIndex: 'created_at', render: formatDate, title: copy.tables.createdAt },
      { dataIndex: 'type', title: copy.tables.type },
      { dataIndex: 'trigger', title: copy.tables.trigger },
      { dataIndex: 'model', title: copy.tables.model },
      {
        dataIndex: 'tokens_total',
        render: (value: number | null) => numberFormatter.format(Number(value || 0)),
        title: copy.tables.tokenUsage,
      },
      {
        dataIndex: 'amount_credits',
        render: (value: number) => `${Number(value || 0).toFixed(2)} ${copy.units.credits}`,
        title: copy.tables.credits,
      },
    ],
    [copy],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert showIcon message={state.error} type="error" />;

  const summary = state.data?.summary;
  const includedUsed = Number(summary?.by_scope?.org_seat || 0);
  const personalUsed = Number(summary?.by_scope?.user || 0);
  const total = Number(plan?.monthly_credits || account?.personal.balance_credits || 1);
  const percent = Math.min(
    100,
    Math.round(((includedUsed + personalUsed) / Math.max(total, 1)) * 100),
  );

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic
            prefix={<Icon icon={Sparkles} />}
            suffix={copy.units.credits}
            title={copy.usage.thisMonth}
            value={summary?.total_credits_used || 0}
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={FileText} />}
            title={copy.usage.tokenUsage}
            value={summary?.total_tokens || 0}
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={Database} />}
            suffix="GB"
            title={copy.usage.fileStorage}
            value={plan?.file_storage_gb || 0}
          />
        </Card>
      </div>
      <Card className={styles.section} title={copy.usage.overview}>
        <Flexbox gap={12}>
          <Progress percent={percent} />
          <div className={styles.metricGrid}>
            <Card size="small">
              <Statistic
                suffix={copy.units.credits}
                title={copy.usage.planUsage}
                value={includedUsed}
              />
            </Card>
            <Card size="small">
              <Statistic
                suffix={copy.units.credits}
                title={copy.usage.onDemand}
                value={personalUsed}
              />
            </Card>
            <Card size="small">
              <Statistic
                suffix={copy.units.entries}
                title={copy.usage.vectorStorage}
                value={plan?.vector_storage_entries || 0}
              />
            </Card>
          </div>
        </Flexbox>
      </Card>
      <Card className={styles.section} title={copy.usage.detail}>
        <Table
          columns={columns}
          dataSource={state.data?.items || []}
          locale={{ emptyText: <Empty /> }}
          pagination={false}
          rowKey={'id'}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

UsageView.displayName = 'UsageView';

const CreditsView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  copy: BillingCopy;
  isChinese: boolean;
  moneyFormatter: Intl.NumberFormat;
  onCheckoutSuccess: () => void;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, copy, isChinese, moneyFormatter, onCheckoutSuccess, plansPayload }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const creditState = useBillingJson<AskCoreCreditPackagesPayload>('/credits', false, refreshKey);
  const autoTopupState = useBillingJson<AskCoreAutoTopupPayload>(
    '/credits/auto-topup',
    false,
    refreshKey,
  );
  const [checkoutPackId, setCheckoutPackId] = useState<string | null>(null);
  const [wechatCheckout, setWechatCheckout] = useState<CheckoutResponse | null>(null);
  const [savingAutoTopup, setSavingAutoTopup] = useState(false);
  const [form] = Form.useForm<AskCoreAutoTopupPayload>();
  const provider = resolveDefaultProvider(plansPayload?.providers, { isChinese });
  const account = accountState.data;
  const plan = plansPayload?.plans.find((item) => item.id === account?.personal.plan_id);
  const isPaid = account?.personal.plan_id && account.personal.plan_id !== 'free';

  useEffect(() => {
    if (autoTopupState.data) form.setFieldsValue(autoTopupState.data);
  }, [autoTopupState.data, form]);

  const handleTopUp = useCallback(
    async (pack: AskCoreCreditPack) => {
      if (!provider) return;
      setCheckoutPackId(pack.id);
      try {
        const checkout = await billingJson<CheckoutResponse>('/checkout/topup', {
          body: JSON.stringify({
            interval: 'payonce',
            pack_id: pack.id,
            provider,
            purpose: 'topup',
            scope_type: 'user',
          }),
          method: 'POST',
        });
        if (isWechatQrCheckout(checkout)) {
          setWechatCheckout(checkout);
        } else if (checkout.provider === 'wechat') {
          throw new Error(copy.payment.wechatUnavailable);
        } else {
          requestParentOpenUrl(checkout.url);
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : copy.errors.checkoutFailed);
      } finally {
        setCheckoutPackId(null);
      }
    },
    [copy.errors.checkoutFailed, copy.payment.wechatUnavailable, provider],
  );

  const handleSaveAutoTopup = useCallback(async () => {
    setSavingAutoTopup(true);
    try {
      const values = await form.validateFields();
      await billingJson<AskCoreAutoTopupPayload>('/credits/auto-topup', {
        body: JSON.stringify(values),
        method: 'PUT',
      });
      message.success(copy.credits.autoTopupSaved);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : copy.errors.saveAutoTopupFailed);
    } finally {
      setSavingAutoTopup(false);
    }
  }, [copy.credits.autoTopupSaved, copy.errors.saveAutoTopupFailed, form]);

  const handleCheckoutSuccess = useCallback(() => {
    setRefreshKey((key) => key + 1);
    onCheckoutSuccess();
  }, [onCheckoutSuccess]);

  if (accountState.loading || creditState.loading)
    return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert showIcon message={accountState.error} type="error" />;
  if (creditState.error) return <Alert showIcon message={creditState.error} type="error" />;

  const packages = creditState.data?.available_packs?.length
    ? creditState.data.available_packs
    : plansPayload?.credit_packs || [];

  const packageColumns: ColumnsType<AskCoreCreditPackageRow> = [
    { dataIndex: 'purchased_at', render: formatDate, title: copy.credits.purchasedOn },
    { dataIndex: 'source', title: copy.credits.source },
    {
      dataIndex: 'remaining_credits',
      render: (value: number) => formatCredits(value, copy),
      title: copy.credits.balance,
    },
    { dataIndex: 'expires_at', render: formatDate, title: copy.credits.expiresAt },
    {
      dataIndex: 'status',
      render: (value: string) => (
        <Badge
          status={value === 'active' ? 'success' : 'default'}
          text={formatBillingStatus(value, copy)}
        />
      ),
      title: copy.credits.status,
    },
  ];

  return (
    <Flexbox gap={16}>
      <WechatCheckoutModal
        checkout={wechatCheckout}
        copy={copy}
        onClose={() => setWechatCheckout(null)}
        onSuccess={handleCheckoutSuccess}
      />
      <div className={styles.metricGrid}>
        <Card>
          <Statistic
            suffix={copy.units.credits}
            title={copy.credits.topupBalance}
            value={creditState.data?.balance_credits || 0}
          />
        </Card>
        <Card>
          <Statistic
            suffix={copy.units.credits}
            title={copy.credits.subscriptionCredits}
            value={plan?.monthly_credits || 0}
          />
        </Card>
        <Card>
          <Statistic
            title={copy.credits.currentPlan}
            value={localPlanName(plan, isChinese) || account?.personal.plan_id || 'free'}
          />
        </Card>
      </div>
      {!isPaid && <Alert showIcon message={copy.credits.freeNeedsPaidPlan} type="info" />}
      <Card className={styles.section} title={copy.credits.purchaseCredits}>
        {packages.length === 0 ? (
          <Empty description={copy.credits.noPacks} />
        ) : (
          <div className={styles.cardGrid}>
            {packages.map((pack) => (
              <Card key={pack.id} size="small">
                <Flexbox gap={12}>
                  <Flexbox horizontal align={'center'} justify={'space-between'}>
                    <Text strong>{localPackName(pack, isChinese)}</Text>
                    <Tag>
                      {pack.validity_months || 6} {copy.credits.validityMonths}
                    </Tag>
                  </Flexbox>
                  <Text type={'secondary'}>{formatCredits(pack.credits, copy)}</Text>
                  <Text style={{ fontSize: 22, fontWeight: 700 }}>
                    {moneyFormatter.format(moneyValue(pack.price_usd, pack.price_cny, isChinese))}
                  </Text>
                  <Text type={'secondary'}>
                    {(isChinese ? pack.unit_price_cny_per_million : pack.unit_price_usd_per_million)
                      ? `${moneyFormatter.format(
                          moneyValue(
                            pack.unit_price_usd_per_million,
                            pack.unit_price_cny_per_million,
                            isChinese,
                          ),
                        )} ${copy.units.perMillionCredits}`
                      : copy.credits.unitPriceFallback}
                  </Text>
                  <Button
                    disabled={!provider || !isPaid}
                    loading={checkoutPackId === pack.id}
                    type="primary"
                    onClick={() => handleTopUp(pack)}
                  >
                    {copy.actions.purchaseNow}
                  </Button>
                </Flexbox>
              </Card>
            ))}
          </div>
        )}
      </Card>
      <Card className={styles.section} title={copy.credits.autoTopup}>
        {autoTopupState.error ? (
          <Alert showIcon message={autoTopupState.error} type="warning" />
        ) : (
          <Form form={form} layout="vertical">
            <div className={styles.metricGrid}>
              <Form.Item name="enabled" valuePropName="checked">
                <Switch
                  checkedChildren={copy.credits.enabled}
                  unCheckedChildren={copy.credits.disabled}
                />
              </Form.Item>
              <Form.Item label={copy.credits.threshold} name="threshold_credits">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label={copy.credits.targetBalance} name="target_credits">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label={copy.credits.monthlyLimit} name="monthly_limit_usd">
                <InputNumber min={0} prefix={isChinese ? '¥' : '$'} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            {!autoTopupState.data?.has_payment_method && (
              <Alert showIcon message={copy.credits.autoTopupNoPayment} type="warning" />
            )}
            <Flexbox horizontal justify={'flex-end'} style={{ marginTop: 12 }}>
              <Button loading={savingAutoTopup} type="primary" onClick={handleSaveAutoTopup}>
                {copy.actions.save}
              </Button>
            </Flexbox>
          </Form>
        )}
      </Card>
      <Card className={styles.section} title={copy.credits.myPackages}>
        <Table
          columns={packageColumns}
          dataSource={creditState.data?.items || []}
          locale={{ emptyText: <Empty description={copy.credits.noPackages} /> }}
          pagination={false}
          rowKey="id"
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

CreditsView.displayName = 'CreditsView';

export const BillingView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  copy: BillingCopy;
  isChinese: boolean;
  moneyFormatter: Intl.NumberFormat;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, copy, isChinese, moneyFormatter, plansPayload }) => {
  const historyState = useBillingJson<AskCoreBillingHistoryPayload>('/billing-history');
  const planNames = useMemo(
    () =>
      Object.fromEntries(
        (plansPayload?.plans || []).map((plan) => [plan.id, localPlanName(plan, isChinese)]),
      ) as Record<string, string>,
    [isChinese, plansPayload?.plans],
  );

  const columns: ColumnsType<AskCoreInvoiceRow> = [
    { dataIndex: 'provider_invoice_id', title: copy.billing.orderNumber },
    { dataIndex: 'provider', title: copy.billing.paymentGateway },
    {
      dataIndex: 'amount_paid_usd',
      render: (_value: number, row) =>
        moneyFormatter.format(moneyValue(row.amount_paid_usd, row.amount_paid_cny, isChinese)),
      title: copy.billing.amount,
    },
    { dataIndex: 'created_at', render: formatDate, title: copy.billing.paymentDate },
    {
      dataIndex: 'status',
      render: (value: string) => (
        <Badge
          color={value === 'paid' ? 'green' : 'blue'}
          text={formatBillingStatus(value || 'pending', copy)}
        />
      ),
      title: copy.billing.transactionStatus,
    },
  ];

  if (accountState.loading || historyState.loading)
    return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert showIcon message={accountState.error} type="error" />;
  if (historyState.error) return <Alert showIcon message={historyState.error} type="error" />;

  const summary = historyState.data?.summary;
  const currentTerm = summary?.current_term;
  const scheduledTerms = summary?.scheduled_terms || [];

  return (
    <Flexbox gap={16}>
      <Card className={styles.section} title={copy.billing.billingSummary}>
        <Flexbox gap={12}>
          <Descriptions
            column={{ lg: 3, md: 2, sm: 1, xs: 1 }}
            items={[
              {
                key: 'plan',
                label: copy.billing.currentPlan,
                children:
                  planNames[summary?.plan_id || ''] ||
                  (summary?.plan_id
                    ? formatBillingStatus(summary.plan_id, copy)
                    : formatBillingStatus('free', copy)),
              },
              {
                key: 'status',
                label: copy.billing.status,
                children: formatBillingStatus(summary?.subscription_status || 'free', copy),
              },
              {
                key: 'interval',
                label: copy.billing.billingCycle,
                children: currentTerm ? formatBillingInterval(currentTerm.interval, copy) : '-',
              },
              {
                key: 'start',
                label: copy.billing.startDate,
                children: formatDate(currentTerm?.term_start),
              },
              {
                key: 'end',
                label: copy.billing.endDate,
                children: formatDate(currentTerm?.term_end),
              },
              {
                key: 'renewal',
                label: copy.billing.renewalMode,
                children: formatPersonalRenewalMode(summary?.renewal_mode, copy),
              },
              {
                key: 'scheduled',
                label: copy.billing.scheduledTerms,
                span: 3,
                children:
                  scheduledTerms.length === 0 ? (
                    copy.billing.noScheduledTerms
                  ) : (
                    <Flexbox gap={4}>
                      {scheduledTerms.map((term) => (
                        <Text key={term.id}>
                          {planNames[term.plan_id] || term.plan_id} ·{' '}
                          {formatBillingInterval(term.interval, copy)} ·{' '}
                          {formatDate(term.term_start)} – {formatDate(term.term_end)}
                        </Text>
                      ))}
                    </Flexbox>
                  ),
              },
            ]}
          />
        </Flexbox>
      </Card>
      <Card className={styles.section} title={copy.billing.billingHistory}>
        <Table
          columns={columns}
          dataSource={historyState.data?.items || []}
          locale={{ emptyText: <Empty description={copy.billing.billingHistory} /> }}
          pagination={false}
          rowKey={'id'}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

BillingView.displayName = 'BillingView';

const ReferralView = memo<{ copy: BillingCopy }>(({ copy }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useBillingJson<AskCoreReferralPayload>('/referrals', false, refreshKey);
  const [editForm] = Form.useForm<{ referral_code: string }>();
  const [backfillForm] = Form.useForm<{ referral_code: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.data?.referral_code)
      editForm.setFieldsValue({ referral_code: state.data.referral_code });
  }, [editForm, state.data?.referral_code]);

  const copyText = useCallback(
    async (value?: string) => {
      if (!value) return;
      await navigator.clipboard?.writeText(value);
      message.success(copy.messages.copied);
    },
    [copy.messages.copied],
  );

  const saveReferralCode = useCallback(async () => {
    setSaving(true);
    try {
      const values = await editForm.validateFields();
      await billingJson('/referrals/code', {
        body: JSON.stringify(values),
        method: 'PATCH',
      });
      message.success(copy.messages.referralSaved);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : copy.errors.updateFailed);
    } finally {
      setSaving(false);
    }
  }, [copy.errors.updateFailed, copy.messages.referralSaved, editForm]);

  const backfillReferralCode = useCallback(async () => {
    setSaving(true);
    try {
      const values = await backfillForm.validateFields();
      await billingJson('/referrals/backfill', {
        body: JSON.stringify(values),
        method: 'POST',
      });
      message.success(copy.messages.bindSuccess);
      backfillForm.resetFields();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : copy.errors.bindFailed);
    } finally {
      setSaving(false);
    }
  }, [backfillForm, copy.errors.bindFailed, copy.messages.bindSuccess]);

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert showIcon message={state.error} type="error" />;
  if (!state.data?.enabled) {
    return <Empty description={copy.referral.notEnabled} />;
  }

  const data = state.data;
  const columns: ColumnsType<AskCoreReferralPayload['items'][number]> = [
    { dataIndex: 'created_at', render: formatDate, title: copy.referral.registrationTime },
    { dataIndex: 'invitee_email', title: copy.referral.inviteeEmail },
    {
      dataIndex: 'reward_credits',
      render: (value: number) => formatCredits(value, copy),
      title: copy.referral.myReward,
    },
    {
      dataIndex: 'status',
      render: (value: string) => (
        <Badge
          status={value === 'rewarded' ? 'success' : 'processing'}
          text={formatBillingStatus(value, copy)}
        />
      ),
      title: copy.referral.status,
    },
  ];
  const referralRules = localizeReferralRules(data.rules, data.reward_credits, copy);

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic
            prefix={<Icon icon={Users} />}
            title={copy.referral.totalInvites}
            value={data.total_invites}
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={Gift} />}
            title={copy.referral.validConversions}
            value={data.total_rewarded}
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={WalletCards} />}
            suffix={copy.units.credits}
            title={copy.referral.availableBalance}
            value={data.available_balance || 0}
          />
        </Card>
      </div>
      <div className={styles.cardGrid}>
        <Card title={copy.referral.codeTitle}>
          <Flexbox gap={12}>
            <Text type={'secondary'}>{copy.referral.codeDescription}</Text>
            <Form form={editForm} layout="inline">
              <Form.Item
                name="referral_code"
                rules={[{ message: copy.referral.codePattern, pattern: /^\w{2,8}$/ }]}
              >
                <Input />
              </Form.Item>
              <Button icon={<Icon icon={Copy} />} onClick={() => copyText(data.referral_code)}>
                {copy.actions.copy}
              </Button>
              <Button loading={saving} type="primary" onClick={saveReferralCode}>
                {copy.actions.save}
              </Button>
            </Form>
          </Flexbox>
        </Card>
        <Card title={copy.referral.linkTitle}>
          <Flexbox gap={12}>
            <Text type={'secondary'}>{copy.referral.linkDescription}</Text>
            <Input readOnly value={data.referral_link} />
            <Button icon={<Icon icon={Link} />} onClick={() => copyText(data.referral_link)}>
              {copy.actions.copyLink}
            </Button>
          </Flexbox>
        </Card>
      </div>
      <Card className={styles.section} title={copy.referral.backfillTitle}>
        <Flexbox gap={12}>
          <Text type={'secondary'}>{copy.referral.backfillDescription}</Text>
          <Form form={backfillForm} layout="inline">
            <Form.Item name="referral_code" rules={[{ required: true }]}>
              <Input placeholder={copy.referral.placeholder} />
            </Form.Item>
            <Button loading={saving} type="primary" onClick={backfillReferralCode}>
              {copy.actions.bind}
            </Button>
          </Form>
        </Flexbox>
      </Card>
      <Card className={styles.section} title={copy.referral.programRules}>
        <List
          dataSource={referralRules}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <Icon icon={Check} />
                <Text>{item.text}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
      <Card className={styles.section} title={copy.referral.history}>
        <Table
          columns={columns}
          dataSource={data.items}
          locale={{ emptyText: <Empty description={copy.referral.noHistory} /> }}
          pagination={false}
          rowKey={(row) => row.invitee_user_id}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

ReferralView.displayName = 'ReferralView';

const AskCoreBillingPage = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
  const { i18n, t } = useTranslation('subscription');
  const isChinese = isChineseLanguage(i18n.language);
  const translate = useMemo(() => t as unknown as TranslateFn, [t]);
  const copy = useMemo(
    () => createLocalizedBillingCopy(i18n.language, translate),
    [i18n.language, translate],
  );
  const moneyFormatter = useMemo(() => createMoneyFormatter(isChinese), [isChinese]);
  const [accountRefreshKey, setAccountRefreshKey] = useState(0);
  const handleCheckoutSuccess = useCallback(() => setAccountRefreshKey((key) => key + 1), []);
  const plansState = useBillingJson<AskCorePlansPayload>('/plans', true);
  const accountState = useBillingJson<AskCoreAccountPayload>('/account', false, accountRefreshKey);

  return (
    <Flexbox className={styles.page} gap={20}>
      <Flexbox className={styles.pageInner} gap={20}>
        <PageHeader
          account={accountState.data}
          copy={copy}
          page={page}
          plansPayload={plansState.data}
        />
        <PaymentReturnAlert copy={copy} onSuccess={handleCheckoutSuccess} />
        {page === 'plans' && (
          <PlansView
            account={accountState.data}
            copy={copy}
            isChinese={isChinese}
            moneyFormatter={moneyFormatter}
            plansPayload={plansState.data}
            state={plansState}
            onCheckoutSuccess={handleCheckoutSuccess}
          />
        )}
        {page === 'usage' && (
          <UsageView account={accountState.data} copy={copy} plansPayload={plansState.data} />
        )}
        {page === 'credits' && (
          <CreditsView
            accountState={accountState}
            copy={copy}
            isChinese={isChinese}
            moneyFormatter={moneyFormatter}
            plansPayload={plansState.data}
            onCheckoutSuccess={handleCheckoutSuccess}
          />
        )}
        {page === 'billing' && (
          <BillingView
            accountState={accountState}
            copy={copy}
            isChinese={isChinese}
            moneyFormatter={moneyFormatter}
            plansPayload={plansState.data}
          />
        )}
        {page === 'referral' && <ReferralView copy={copy} />}
        {!isAskCoreBillingPageKey(page) && <Empty />}
      </Flexbox>
    </Flexbox>
  );
});

AskCoreBillingPage.displayName = 'AskCoreBillingPage';

export const AskCoreBillingEmbedRoute = memo(() => {
  const params = useParams();
  const page = isAskCoreBillingPageKey(params.page) ? params.page : 'plans';
  return <AskCoreBillingPage page={page} />;
});

AskCoreBillingEmbedRoute.displayName = 'AskCoreBillingEmbedRoute';

export default AskCoreBillingPage;
