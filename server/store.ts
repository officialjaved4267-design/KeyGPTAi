import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin';
export type AccountStatus = 'active' | 'suspended';
export type TransactionType =
  | 'signup_bonus'
  | 'daily_reset'
  | 'ai_usage'
  | 'admin_add'
  | 'admin_deduct'
  | 'admin_set'
  | 'admin_unlimited';

export const DEFAULT_USER_AUTHORITIES = [
  'studio_chat',
  'studio_text',
  'studio_photo_edit',
  'studio_video_edit',
] as const;

export const ADMIN_AUTHORITIES = [
  'manage_users',
  'manage_credits',
  'manage_admins',
  'view_analytics',
  'unlimited_ai',
] as const;

export interface ServerUser {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash?: string;
  passwordSalt?: string;
  role: UserRole;
  authorities: string[];
  credits: number;
  unlimitedCredits: boolean;
  status: AccountStatus;
  lastCreditReset: number;
  createdAt: number;
  updatedAt: number;
  totalUsageCount: number;
  totalCreditsSpent: number;
}

export interface ServerAdmin {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  unlimitedCredits: boolean;
  status: AccountStatus;
  createdAt: number;
  createdBy: string;
  lastLoginAt: number | null;
}

export interface ServerAuthorityInvite {
  id: string;
  codeHash: string;
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

export interface ServerTransaction {
  id: string;
  userId: string;
  username: string;
  email: string;
  type: TransactionType;
  feature: string;
  amount: number;
  balanceAfter: number;
  unlimitedAfter: boolean;
  actorId: string;
  actorLabel: string;
  note: string;
  createdAt: number;
}

export interface ServerActivityLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  feature: string;
  creditsUsed: number;
  model: string;
  createdAt: number;
}

interface DatabaseState {
  users: Record<string, ServerUser>;
  admins: Record<string, ServerAdmin>;
  authorityInvites: Record<string, ServerAuthorityInvite>;
  transactions: ServerTransaction[];
  activityLogs: ServerActivityLog[];
}

export const DAILY_FREE_CREDITS = 50;
export const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const FEATURE_COSTS = {
  chat: 1,
  text_tool: 1,
  image_edit: 4,
  bg_remove: 4,
  photo_enhance: 4,
  video_subtitles: 3,
  video_edit: 10,
} as const;

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'keyai-db.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function createInitialState(): DatabaseState {
  const now = Date.now();
  const initialUsername = process.env.INITIAL_ADMIN_USERNAME || 'KeyBloxx001';
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Sub2KeyBloxx001RBLXMC';
  const { hash, salt } = hashPassword(initialPassword);
  const adminId = 'admin_keybloxx001';

  const initialAdmin: ServerAdmin = {
    id: adminId,
    username: initialUsername,
    email: 'admin@keyai.studio',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'super_admin',
    permissions: [
      'manage_users',
      'manage_credits',
      'manage_admins',
      'view_analytics',
      'unlimited_ai',
    ],
    unlimitedCredits: true,
    status: 'active',
    createdAt: now,
    createdBy: 'system',
    lastLoginAt: null,
  };

  return {
    users: {},
    admins: {
      [adminId]: initialAdmin,
    },
    authorityInvites: {},
    transactions: [],
    activityLogs: [],
  };
}

let state: DatabaseState = loadState();

function loadState(): DatabaseState {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialState();
    saveState(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    const users = parsed.users ?? {};
    for (const u of Object.values(users)) {
      if (!Array.isArray(u.authorities)) {
        u.authorities = [...DEFAULT_USER_AUTHORITIES];
      }
    }
    const hydrated: DatabaseState = {
      users,
      admins: parsed.admins ?? {},
      authorityInvites: parsed.authorityInvites ?? {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    };
    // Ensure root admin exists and remains active with full super_admin permissions
    const initialUsername = process.env.INITIAL_ADMIN_USERNAME || 'KeyBloxx001';
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Sub2KeyBloxx001RBLXMC';
    const existingRoot = Object.values(hydrated.admins).find(
      (a) => a.id === 'admin_keybloxx001' || a.username.toLowerCase() === initialUsername.toLowerCase()
    );
    if (!existingRoot) {
      const seeded = createInitialState();
      hydrated.admins['admin_keybloxx001'] = seeded.admins['admin_keybloxx001'];
      saveState(hydrated);
    } else if (existingRoot.status !== 'active' || existingRoot.role !== 'super_admin') {
      const { hash, salt } = hashPassword(initialPassword);
      existingRoot.status = 'active';
      existingRoot.role = 'super_admin';
      existingRoot.unlimitedCredits = true;
      existingRoot.permissions = [...ADMIN_AUTHORITIES];
      if (!verifyPassword(initialPassword, existingRoot.passwordHash, existingRoot.passwordSalt)) {
        existingRoot.passwordHash = hash;
        existingRoot.passwordSalt = salt;
      }
      saveState(hydrated);
    }
    return hydrated;
  } catch {
    const fallback = createInitialState();
    saveState(fallback);
    return fallback;
  }
}

function saveState(nextState: DatabaseState = state): void {
  ensureDataDir();
  const tempPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(nextState, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_FILE);
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'moderator';
}

export function ensureDailyReset(user: ServerUser): boolean {
  if (user.unlimitedCredits || isAdminRole(user.role)) {
    return false;
  }
  const now = Date.now();
  if (now - user.lastCreditReset >= RESET_INTERVAL_MS) {
    const previous = user.credits;
    user.credits = DAILY_FREE_CREDITS;
    user.lastCreditReset = now;
    user.updatedAt = now;
    recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'daily_reset',
      feature: 'Daily 24h Credit Reset',
      amount: DAILY_FREE_CREDITS - previous,
      balanceAfter: DAILY_FREE_CREDITS,
      unlimitedAfter: user.unlimitedCredits,
      actorId: 'system',
      actorLabel: 'Automated 24h Scheduler',
      note: `24-hour credit allowance reset from ${previous} to ${DAILY_FREE_CREDITS}`,
    });
    saveState();
    return true;
  }
  return false;
}

export function recordTransaction(input: Omit<ServerTransaction, 'id' | 'createdAt'>): ServerTransaction {
  const tx: ServerTransaction = {
    id: makeId('tx'),
    ...input,
    createdAt: Date.now(),
  };
  state.transactions.unshift(tx);
  if (state.transactions.length > 5000) {
    state.transactions = state.transactions.slice(0, 5000);
  }
  return tx;
}

export function recordActivity(input: Omit<ServerActivityLog, 'id' | 'createdAt'>): ServerActivityLog {
  const entry: ServerActivityLog = {
    id: makeId('act'),
    ...input,
    createdAt: Date.now(),
  };
  state.activityLogs.unshift(entry);
  if (state.activityLogs.length > 5000) {
    state.activityLogs = state.activityLogs.slice(0, 5000);
  }
  return entry;
}

export function upsertFirebaseUser(params: {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
}): ServerUser {
  const now = Date.now();
  const existing = state.users[params.uid];
  if (existing) {
    if (params.email && existing.email !== params.email) {
      existing.email = params.email;
    }
    if (params.displayName && !existing.displayName) {
      existing.displayName = params.displayName;
    }
    ensureDailyReset(existing);
    saveState();
    return existing;
  }

  const baseUsername =
    params.username?.trim() ||
    params.displayName?.trim() ||
    params.email.split('@')[0] ||
    `user_${params.uid.slice(0, 6)}`;

  const linkedAdmin = Object.values(state.admins).find(
    (a) => a.email.toLowerCase() === params.email.toLowerCase() && a.status === 'active'
  );

  const role: UserRole = linkedAdmin ? linkedAdmin.role : 'user';
  const unlimited = Boolean(linkedAdmin);

  const user: ServerUser = {
    uid: params.uid,
    email: params.email,
    username: baseUsername.slice(0, 40),
    displayName: (params.displayName || baseUsername).slice(0, 80),
    role,
    authorities: [...DEFAULT_USER_AUTHORITIES],
    credits: DAILY_FREE_CREDITS,
    unlimitedCredits: unlimited,
    status: 'active',
    lastCreditReset: now,
    createdAt: now,
    updatedAt: now,
    totalUsageCount: 0,
    totalCreditsSpent: 0,
  };

  state.users[params.uid] = user;
  recordTransaction({
    userId: user.uid,
    username: user.username,
    email: user.email,
    type: 'signup_bonus',
    feature: 'Welcome Daily Allocation',
    amount: DAILY_FREE_CREDITS,
    balanceAfter: DAILY_FREE_CREDITS,
    unlimitedAfter: unlimited,
    actorId: 'system',
    actorLabel: 'KeyAi Registration',
    note: unlimited ? 'Admin account linked with unlimited credits' : 'Initial 50 daily credits granted',
  });
  saveState();
  return user;
}

export function registerLocalUser(params: {
  username: string;
  email: string;
  password: string;
}): ServerUser | { error: string; status: number } {
  const cleanUsername = params.username.trim();
  const cleanEmail = params.email.trim().toLowerCase();
  if (cleanUsername.length < 2 || cleanUsername.length > 40) {
    return { error: 'Username must be between 2 and 40 characters.', status: 400 };
  }
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    return { error: 'Please enter a valid email address.', status: 400 };
  }
  if (params.password.length < 6) {
    return { error: 'Password must be at least 6 characters long.', status: 400 };
  }
  const existingEmail = Object.values(state.users).find(
    (u) => u.email.toLowerCase() === cleanEmail
  );
  if (existingEmail) {
    return { error: 'An account with this email already exists. Switch to Sign In instead.', status: 409 };
  }
  const existingUsername = Object.values(state.users).find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
  );
  if (existingUsername) {
    return { error: 'This username is already taken. Please choose another.', status: 409 };
  }

  const now = Date.now();
  const { hash, salt } = hashPassword(params.password);
  const uid = makeId('usr');
  const linkedAdmin = getAdminByEmail(cleanEmail);
  const isLinkedAdmin = Boolean(linkedAdmin && linkedAdmin.status === 'active');

  const user: ServerUser = {
    uid,
    email: cleanEmail,
    username: cleanUsername,
    displayName: cleanUsername,
    passwordHash: hash,
    passwordSalt: salt,
    role: isLinkedAdmin && linkedAdmin ? linkedAdmin.role : 'user',
    authorities: [...DEFAULT_USER_AUTHORITIES],
    credits: DAILY_FREE_CREDITS,
    unlimitedCredits: isLinkedAdmin,
    status: 'active',
    lastCreditReset: now,
    createdAt: now,
    updatedAt: now,
    totalUsageCount: 0,
    totalCreditsSpent: 0,
  };

  state.users[uid] = user;
  recordTransaction({
    userId: user.uid,
    username: user.username,
    email: user.email,
    type: 'signup_bonus',
    feature: 'Welcome Daily Allocation',
    amount: DAILY_FREE_CREDITS,
    balanceAfter: DAILY_FREE_CREDITS,
    unlimitedAfter: user.unlimitedCredits,
    actorId: 'system',
    actorLabel: 'KeyAi Registration',
    note: 'Registered with 50 daily credits and creator studio authorities',
  });
  saveState();
  return user;
}

export function authenticateLocalUser(params: {
  identifier: string;
  password: string;
}): ServerUser | { error: string; status: number } {
  const needle = params.identifier.trim().toLowerCase();
  const user = Object.values(state.users).find(
    (u) => u.email.toLowerCase() === needle || u.username.toLowerCase() === needle
  );
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return { error: 'Invalid email/username or password.', status: 401 };
  }
  if (!verifyPassword(params.password, user.passwordHash, user.passwordSalt)) {
    return { error: 'Invalid email/username or password.', status: 401 };
  }
  if (user.status === 'suspended') {
    return { error: 'Your account has been suspended by an administrator.', status: 403 };
  }
  ensureDailyReset(user);
  saveState();
  return user;
}

export function sanitizeUserForClient(user: ServerUser): Omit<ServerUser, 'passwordHash' | 'passwordSalt'> {
  const { passwordHash: _ph, passwordSalt: _ps, ...safe } = user;
  return {
    ...safe,
    authorities: Array.isArray(safe.authorities) ? safe.authorities : [...DEFAULT_USER_AUTHORITIES],
  };
}

export function getUserById(uid: string): ServerUser | undefined {
  const user = state.users[uid];
  if (user) {
    if (!Array.isArray(user.authorities)) {
      user.authorities = [...DEFAULT_USER_AUTHORITIES];
    }
    ensureDailyReset(user);
  }
  return user;
}

export function updateUserProfileName(uid: string, username: string, displayName: string): ServerUser | null {
  const user = state.users[uid];
  if (!user) return null;
  user.username = username.trim().slice(0, 40) || user.username;
  user.displayName = displayName.trim().slice(0, 80) || user.displayName;
  user.updatedAt = Date.now();
  saveState();
  return user;
}

export function getAdminById(id: string): ServerAdmin | undefined {
  return state.admins[id];
}

export function getAdminByUsername(username: string): ServerAdmin | undefined {
  const needle = username.trim().toLowerCase();
  return Object.values(state.admins).find((a) => a.username.toLowerCase() === needle);
}

export function getAdminByEmail(email: string): ServerAdmin | undefined {
  const needle = email.trim().toLowerCase();
  return Object.values(state.admins).find((a) => a.email.toLowerCase() === needle);
}

export function getAdminByIdentifier(identifier: string): ServerAdmin | undefined {
  const needle = identifier.trim().toLowerCase();
  return Object.values(state.admins).find(
    (a) => a.username.toLowerCase() === needle || a.email.toLowerCase() === needle
  );
}

export function markAdminLogin(adminId: string): void {
  const admin = state.admins[adminId];
  if (admin) {
    admin.lastLoginAt = Date.now();
    admin.unlimitedCredits = true;
    saveState();
  }
}

export function chargeForOperation(params: {
  actorType: 'admin' | 'user';
  uid: string;
  username: string;
  email: string;
  cost: number;
  feature: string;
  model: string;
}): { ok: true; balanceAfter: number; unlimited: boolean; txId: string } | { ok: false; status: number; error: string } {
  if (params.actorType === 'admin') {
    const admin = state.admins[params.uid];
    if (!admin || admin.status === 'suspended') {
      return { ok: false, status: 403, error: 'Admin account is suspended or inactive.' };
    }
    const tx = recordTransaction({
      userId: admin.id,
      username: admin.username,
      email: admin.email,
      type: 'ai_usage',
      feature: params.feature,
      amount: 0,
      balanceAfter: 999999,
      unlimitedAfter: true,
      actorId: admin.id,
      actorLabel: admin.username,
      note: `Unlimited admin usage (${params.model})`,
    });
    recordActivity({
      userId: admin.id,
      username: admin.username,
      action: params.feature,
      feature: params.feature,
      creditsUsed: 0,
      model: params.model,
    });
    saveState();
    return { ok: true, balanceAfter: 999999, unlimited: true, txId: tx.id };
  }

  const user = state.users[params.uid];
  if (!user) {
    return { ok: false, status: 404, error: 'User profile not found.' };
  }
  if (user.status === 'suspended') {
    return { ok: false, status: 403, error: 'Your account has been suspended by an administrator.' };
  }

  ensureDailyReset(user);

  if (user.unlimitedCredits || isAdminRole(user.role)) {
    user.totalUsageCount += 1;
    user.updatedAt = Date.now();
    const tx = recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'ai_usage',
      feature: params.feature,
      amount: 0,
      balanceAfter: user.credits,
      unlimitedAfter: true,
      actorId: user.uid,
      actorLabel: user.username,
      note: `Unlimited credits usage (${params.model})`,
    });
    recordActivity({
      userId: user.uid,
      username: user.username,
      action: params.feature,
      feature: params.feature,
      creditsUsed: 0,
      model: params.model,
    });
    saveState();
    return { ok: true, balanceAfter: user.credits, unlimited: true, txId: tx.id };
  }

  if (user.credits < params.cost) {
    return {
      ok: false,
      status: 402,
      error: `Insufficient credits. This action requires ${params.cost} credits, and you have ${user.credits} remaining.`,
    };
  }

  user.credits = Math.max(0, user.credits - params.cost);
  user.totalUsageCount += 1;
  user.totalCreditsSpent += params.cost;
  user.updatedAt = Date.now();

  const tx = recordTransaction({
    userId: user.uid,
    username: user.username,
    email: user.email,
    type: 'ai_usage',
    feature: params.feature,
    amount: -params.cost,
    balanceAfter: user.credits,
    unlimitedAfter: false,
    actorId: user.uid,
    actorLabel: user.username,
    note: `Used ${params.model}`,
  });

  recordActivity({
    userId: user.uid,
    username: user.username,
    action: params.feature,
    feature: params.feature,
    creditsUsed: params.cost,
    model: params.model,
  });

  saveState();
  return { ok: true, balanceAfter: user.credits, unlimited: false, txId: tx.id };
}

export function refundFailedOperation(params: {
  actorType: 'admin' | 'user';
  uid: string;
  cost: number;
  feature: string;
}): void {
  if (params.actorType === 'admin' || params.cost <= 0) return;
  const user = state.users[params.uid];
  if (!user || user.unlimitedCredits || isAdminRole(user.role)) return;

  user.credits += params.cost;
  user.totalCreditsSpent = Math.max(0, user.totalCreditsSpent - params.cost);
  user.updatedAt = Date.now();
  recordTransaction({
    userId: user.uid,
    username: user.username,
    email: user.email,
    type: 'admin_add',
    feature: `${params.feature} (Auto-Refund)`,
    amount: params.cost,
    balanceAfter: user.credits,
    unlimitedAfter: user.unlimitedCredits,
    actorId: 'system',
    actorLabel: 'KeyAi Automatic Refund',
    note: 'AI provider error — credits automatically refunded',
  });
  saveState();
}

export function getUserTransactions(userId: string, limit = 50): ServerTransaction[] {
  return state.transactions.filter((t) => t.userId === userId).slice(0, limit);
}

// --- Admin Management Operations ---

export function listAllUsers(search?: string): Array<Omit<ServerUser, 'passwordHash' | 'passwordSalt'>> {
  const users = Object.values(state.users);
  users.forEach((u) => ensureDailyReset(u));
  saveState();
  const q = search?.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
      )
    : users;
  return filtered.sort((a, b) => b.createdAt - a.createdAt).map(sanitizeUserForClient);
}

export function adminMutateUserCredits(params: {
  targetUid: string;
  mode: 'add' | 'deduct' | 'set' | 'toggle_unlimited';
  amount?: number;
  unlimited?: boolean;
  note?: string;
  actorId: string;
  actorLabel: string;
}): ServerUser | { error: string; status: number } {
  const user = state.users[params.targetUid];
  if (!user) return { error: 'Target user not found.', status: 404 };

  const now = Date.now();
  const prev = user.credits;

  if (params.mode === 'toggle_unlimited') {
    const nextUnlimited = typeof params.unlimited === 'boolean' ? params.unlimited : !user.unlimitedCredits;
    user.unlimitedCredits = nextUnlimited;
    user.updatedAt = now;
    recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'admin_unlimited',
      feature: nextUnlimited ? 'Unlimited Credits Enabled' : 'Unlimited Credits Revoked',
      amount: 0,
      balanceAfter: user.credits,
      unlimitedAfter: nextUnlimited,
      actorId: params.actorId,
      actorLabel: params.actorLabel,
      note: params.note || `Admin ${params.actorLabel} updated unlimited status`,
    });
    saveState();
    return user;
  }

  const numericAmount = Math.floor(Number(params.amount ?? 0));
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    return { error: 'Amount must be a non-negative integer.', status: 400 };
  }

  if (params.mode === 'add') {
    user.credits = prev + numericAmount;
    user.updatedAt = now;
    recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'admin_add',
      feature: 'Admin Credit Grant',
      amount: numericAmount,
      balanceAfter: user.credits,
      unlimitedAfter: user.unlimitedCredits,
      actorId: params.actorId,
      actorLabel: params.actorLabel,
      note: params.note || `Added ${numericAmount} credits`,
    });
  } else if (params.mode === 'deduct') {
    const nextBalance = Math.max(0, prev - numericAmount);
    const actualDelta = nextBalance - prev;
    user.credits = nextBalance;
    user.updatedAt = now;
    recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'admin_deduct',
      feature: 'Admin Credit Deduction',
      amount: actualDelta,
      balanceAfter: user.credits,
      unlimitedAfter: user.unlimitedCredits,
      actorId: params.actorId,
      actorLabel: params.actorLabel,
      note: params.note || `Deducted ${Math.abs(actualDelta)} credits`,
    });
  } else if (params.mode === 'set') {
    user.credits = numericAmount;
    user.updatedAt = now;
    recordTransaction({
      userId: user.uid,
      username: user.username,
      email: user.email,
      type: 'admin_set',
      feature: 'Admin Custom Credit Balance',
      amount: numericAmount - prev,
      balanceAfter: user.credits,
      unlimitedAfter: user.unlimitedCredits,
      actorId: params.actorId,
      actorLabel: params.actorLabel,
      note: params.note || `Balance set from ${prev} to ${numericAmount}`,
    });
  }

  saveState();
  return user;
}

export function adminSetUserStatus(params: {
  targetUid: string;
  status: AccountStatus;
  actorId: string;
  actorLabel: string;
}): ServerUser | { error: string; status: number } {
  const user = state.users[params.targetUid];
  if (!user) return { error: 'User not found.', status: 404 };
  user.status = params.status;
  user.updatedAt = Date.now();
  recordActivity({
    userId: user.uid,
    username: user.username,
    action: params.status === 'suspended' ? 'Account Suspended' : 'Account Reactivated',
    feature: 'Admin Governance',
    creditsUsed: 0,
    model: 'system',
  });
  saveState();
  return user;
}

export function adminSetUserAuthorities(params: {
  targetUid: string;
  authorities: string[];
  actorLabel: string;
}): Omit<ServerUser, 'passwordHash' | 'passwordSalt'> | { error: string; status: number } {
  const user = state.users[params.targetUid];
  if (!user) return { error: 'User not found.', status: 404 };
  const allowed = new Set<string>(DEFAULT_USER_AUTHORITIES);
  user.authorities = params.authorities.filter((a) => allowed.has(a));
  user.updatedAt = Date.now();
  recordActivity({
    userId: user.uid,
    username: user.username,
    action: `Updated studio authorities (${user.authorities.join(', ') || 'none'})`,
    feature: 'Admin Governance',
    creditsUsed: 0,
    model: 'system',
  });
  saveState();
  return sanitizeUserForClient(user);
}

function hashInviteCode(rawCode: string): string {
  return crypto.createHash('sha256').update(rawCode.trim().toUpperCase()).digest('hex');
}

export function verifyMasterAuthorizationCode(rawCode: string): boolean {
  const cleanInput = rawCode.trim().toUpperCase();
  if (!cleanInput) return false;
  const configured = (process.env.AUTHORITY_ACCESS_CODE || 'AAAA-1111-BBBB-2222-CCCC-3333')
    .trim()
    .toUpperCase();
  const inputHash = crypto.createHash('sha256').update(cleanInput).digest();
  const expectedHash = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

export function createAuthorityInvite(params: {
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  expiresInHours?: number;
  createdBy: string;
}): { invite: ServerAuthorityInvite; rawCode: string } {
  const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
  const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
  const rawCode = `KAI-AUTH-${partA}-${partB}`;
  const hours = Math.max(1, Math.min(720, Math.floor(params.expiresInHours ?? 72)));
  const now = Date.now();

  const allowedPerms = new Set<string>(ADMIN_AUTHORITIES);
  const filteredPerms = params.permissions.filter((p) => allowedPerms.has(p));

  const invite: ServerAuthorityInvite = {
    id: makeId('inv'),
    codeHash: hashInviteCode(rawCode),
    codePreview: `KAI-AUTH-••••-${partB}`,
    role: params.role,
    permissions:
      filteredPerms.length > 0
        ? filteredPerms
        : ['manage_users', 'manage_credits', 'view_analytics', 'unlimited_ai'],
    createdBy: params.createdBy,
    createdAt: now,
    expiresAt: now + hours * 60 * 60 * 1000,
    usedBy: null,
    usedAt: null,
    revoked: false,
  };

  state.authorityInvites[invite.id] = invite;
  recordActivity({
    userId: 'system',
    username: params.createdBy,
    action: `Issued Authority Invite (${invite.role})`,
    feature: 'Authority Registration',
    creditsUsed: 0,
    model: 'system',
  });
  saveState();
  return { invite, rawCode };
}

export function listAuthorityInvites(): Array<Omit<ServerAuthorityInvite, 'codeHash'>> {
  return Object.values(state.authorityInvites)
    .map(({ codeHash: _h, ...safe }) => safe)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeAuthorityInvite(inviteId: string, actorUsername: string): boolean {
  const invite = state.authorityInvites[inviteId];
  if (!invite) return false;
  invite.revoked = true;
  recordActivity({
    userId: 'system',
    username: actorUsername,
    action: `Revoked Authority Invite ${invite.codePreview}`,
    feature: 'Authority Registration',
    creditsUsed: 0,
    model: 'system',
  });
  saveState();
  return true;
}

export function registerAuthorityWithInvite(params: {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
}): Omit<ServerAdmin, 'passwordHash' | 'passwordSalt'> | { error: string; status: number } {
  const cleanCode = params.inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { error: 'Authorization or invite code is required.', status: 400 };
  }

  if (verifyMasterAuthorizationCode(cleanCode)) {
    return createAdminAccount({
      username: params.username,
      email: params.email,
      password: params.password,
      role: 'admin',
      permissions: [...ADMIN_AUTHORITIES],
      createdBy: 'authorization_code',
    });
  }

  const targetHash = hashInviteCode(cleanCode);
  const invite = Object.values(state.authorityInvites).find((i) => i.codeHash === targetHash);
  if (!invite) {
    return { error: 'Invalid authorization or invite code.', status: 403 };
  }
  if (invite.revoked) {
    return { error: 'This authority invite code has been revoked.', status: 403 };
  }
  if (invite.usedBy) {
    return { error: 'This authority invite code has already been used.', status: 403 };
  }
  if (Date.now() > invite.expiresAt) {
    return { error: 'This authority invite code has expired.', status: 403 };
  }

  const created = createAdminAccount({
    username: params.username,
    email: params.email,
    password: params.password,
    role: invite.role,
    permissions: invite.permissions,
    createdBy: `invite:${invite.createdBy}`,
  });
  if ('error' in created) {
    return created;
  }

  invite.usedBy = created.username;
  invite.usedAt = Date.now();
  saveState();
  return created;
}

export function listAllAdmins(): Array<Omit<ServerAdmin, 'passwordHash' | 'passwordSalt'>> {
  return Object.values(state.admins)
    .map(({ passwordHash: _ph, passwordSalt: _ps, ...safe }) => safe)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function createAdminAccount(params: {
  username: string;
  email: string;
  password: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  createdBy: string;
}): Omit<ServerAdmin, 'passwordHash' | 'passwordSalt'> | { error: string; status: number } {
  const cleanUsername = params.username.trim();
  const cleanEmail = params.email.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 40) {
    return { error: 'Username must be between 3 and 40 characters.', status: 400 };
  }
  if (params.password.length < 8) {
    return { error: 'Admin password must be at least 8 characters.', status: 400 };
  }
  if (getAdminByUsername(cleanUsername)) {
    return { error: 'An admin with this username already exists.', status: 409 };
  }
  if (cleanEmail && getAdminByEmail(cleanEmail)) {
    return { error: 'An admin with this email already exists.', status: 409 };
  }

  const { hash, salt } = hashPassword(params.password);
  const id = makeId('adm');
  const admin: ServerAdmin = {
    id,
    username: cleanUsername,
    email: cleanEmail || `${cleanUsername.toLowerCase()}@keyai.studio`,
    passwordHash: hash,
    passwordSalt: salt,
    role: params.role,
    permissions: params.permissions.slice(0, 10),
    unlimitedCredits: true,
    status: 'active',
    createdAt: Date.now(),
    createdBy: params.createdBy,
    lastLoginAt: null,
  };

  state.admins[id] = admin;

  // If a matching Firebase user already exists, sync their role & unlimited flag
  const matchedUser = Object.values(state.users).find(
    (u) => u.email.toLowerCase() === admin.email.toLowerCase()
  );
  if (matchedUser) {
    matchedUser.role = admin.role;
    matchedUser.unlimitedCredits = true;
    matchedUser.updatedAt = Date.now();
  }

  recordActivity({
    userId: id,
    username: admin.username,
    action: `Admin Created (${admin.role})`,
    feature: 'Admin Portal',
    creditsUsed: 0,
    model: 'system',
  });
  saveState();

  const { passwordHash: _ph, passwordSalt: _ps, ...safe } = admin;
  return safe;
}

export function updateAdminRoleAndPermissions(params: {
  adminId: string;
  role?: 'super_admin' | 'admin' | 'moderator';
  permissions?: string[];
  status?: AccountStatus;
  actorUsername: string;
}): Omit<ServerAdmin, 'passwordHash' | 'passwordSalt'> | { error: string; status: number } {
  const admin = state.admins[params.adminId];
  if (!admin) return { error: 'Admin account not found.', status: 404 };
  if (admin.username === 'KeyBloxx001' && params.status === 'suspended') {
    return { error: 'Cannot suspend the root KeyBloxx001 super_admin account.', status: 400 };
  }

  if (params.role) admin.role = params.role;
  if (Array.isArray(params.permissions)) admin.permissions = params.permissions.slice(0, 10);
  if (params.status) admin.status = params.status;
  admin.unlimitedCredits = true;

  // Sync linked user if any
  const matchedUser = Object.values(state.users).find(
    (u) => u.email.toLowerCase() === admin.email.toLowerCase()
  );
  if (matchedUser && params.role) {
    matchedUser.role = params.role;
    matchedUser.unlimitedCredits = true;
    matchedUser.updatedAt = Date.now();
  }

  recordActivity({
    userId: admin.id,
    username: admin.username,
    action: `Role/Permissions Updated by ${params.actorUsername}`,
    feature: 'Admin Portal',
    creditsUsed: 0,
    model: 'system',
  });

  saveState();
  const { passwordHash: _ph, passwordSalt: _ps, ...safe } = admin;
  return safe;
}

export function getAdminStatsAndHistory(limit = 100) {
  const users = Object.values(state.users);
  const admins = Object.values(state.admins);
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const suspendedUsers = users.filter((u) => u.status === 'suspended').length;
  const unlimitedUsers = users.filter((u) => u.unlimitedCredits).length;
  const totalCreditsInCirculation = users.reduce((sum, u) => sum + (u.unlimitedCredits ? 0 : u.credits), 0);
  const totalCreditsSpent = users.reduce((sum, u) => sum + u.totalCreditsSpent, 0);
  const totalAiOperations = state.activityLogs.filter((l) => l.model !== 'system').length;

  const featureBreakdown: Record<string, number> = {};
  for (const log of state.activityLogs) {
    if (log.model === 'system') continue;
    featureBreakdown[log.feature] = (featureBreakdown[log.feature] || 0) + 1;
  }

  return {
    stats: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      unlimitedUsers,
      totalAdmins: admins.length,
      totalCreditsInCirculation,
      totalCreditsSpent,
      totalAiOperations,
      featureBreakdown,
    },
    transactions: state.transactions.slice(0, limit),
    activityLogs: state.activityLogs.slice(0, limit),
  };
}
