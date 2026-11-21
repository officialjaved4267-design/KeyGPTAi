export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin';
export type AccountStatus = 'active' | 'suspended';

export type WorkspaceSection =
  | 'overview'
  | 'chat'
  | 'text_tools'
  | 'photo_editor'
  | 'video_editor'
  | 'credits'
  | 'admin';

export interface FeatureCosts {
  chat: number;
  text_tool: number;
  image_edit: number;
  bg_remove: number;
  photo_enhance: number;
  video_subtitles: number;
  video_edit: number;
}

export interface KeyAiProfile {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  permissions: string[];
  authorities?: string[];
  credits: number;
  unlimitedCredits: boolean;
  status: AccountStatus;
  lastCreditReset: number;
  nextCreditResetAt: number | null;
  createdAt: number;
  totalUsageCount?: number;
  totalCreditsSpent?: number;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  username: string;
  email: string;
  type:
    | 'signup_bonus'
    | 'daily_reset'
    | 'ai_usage'
    | 'admin_add'
    | 'admin_deduct'
    | 'admin_set'
    | 'admin_unlimited';
  feature: string;
  amount: number;
  balanceAfter: number;
  unlimitedAfter: boolean;
  actorId: string;
  actorLabel: string;
  note: string;
  createdAt: number;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  authorities?: string[];
  credits: number;
  unlimitedCredits: boolean;
  status: AccountStatus;
  lastCreditReset: number;
  createdAt: number;
  updatedAt: number;
  totalUsageCount: number;
  totalCreditsSpent: number;
}

export interface AdminAccountRecord {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  unlimitedCredits: boolean;
  status: AccountStatus;
  createdAt: number;
  createdBy: string;
  lastLoginAt: number | null;
}

export interface AuthorityInviteRecord {
  id: string;
  codePreview: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedBy: string | null;
  usedAt: number | null;
  revoked: boolean;
}

export interface AdminActivityLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  feature: string;
  creditsUsed: number;
  model: string;
  createdAt: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  unlimitedUsers: number;
  totalAdmins: number;
  totalCreditsInCirculation: number;
  totalCreditsSpent: number;
  totalAiOperations: number;
  featureBreakdown: Record<string, number>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  model?: string;
}

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface CreationRecord {
  id: string;
  type: 'image' | 'video' | 'text';
  title: string;
  prompt: string;
  model: string;
  dataUrl?: string;
  textOutput?: string;
  createdAt: number;
}
