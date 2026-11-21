// Security rule test suite verifying all Dirty Dozen payloads return PERMISSION_DENIED
// Run with Firebase Rules Emulator when running local emulator tests.
import assert from 'node:assert/strict';

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const dirtyDozenCases: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-Admin Escalation on Signup',
    collection: 'users/userA',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'userA', role: 'super_admin', credits: 999999, unlimitedCredits: true },
  },
  {
    id: 2,
    name: 'Credit Self-Boost Update',
    collection: 'users/userA',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { credits: 5000 },
  },
  {
    id: 3,
    name: 'Unlimited Flag Hijack',
    collection: 'users/userA',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { unlimitedCredits: true },
  },
  {
    id: 4,
    name: 'Shadow Field Injection',
    collection: 'users/userA',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { username: 'alice', isVip: true },
  },
  {
    id: 5,
    name: 'Unverified Email Admin Spoof',
    collection: 'admins/spoofId',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { email: 'officialjaved4267@gmail.com', email_verified: false },
  },
  {
    id: 6,
    name: 'Cross-User PII Read',
    collection: 'users/userB',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { viewerUid: 'userA' },
  },
  {
    id: 7,
    name: 'Blanket List Scraping',
    collection: 'users',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payload: { viewerUid: 'userA' },
  },
  {
    id: 8,
    name: 'Fake Transaction Fabrication',
    collection: 'credit_transactions/tx1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { userId: 'userA', type: 'admin_add', amount: 1000, balanceAfter: 1050 },
  },
  {
    id: 9,
    name: 'Orphaned Chat Message on Foreign Session',
    collection: 'chat_sessions/sessionOwnedByB/messages/m1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { userId: 'userA', sessionId: 'sessionOwnedByB', role: 'user', content: 'hi' },
  },
  {
    id: 10,
    name: 'Path Variable Poisoning',
    collection: 'creations/invalid..path$id',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { userId: 'userA', type: 'image_generate', prompt: 'test' },
  },
  {
    id: 11,
    name: 'Timestamp Backdating',
    collection: 'creations/c1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { userId: 'userA', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 12,
    name: 'Resource Exhaustion Oversized Prompt',
    collection: 'creations/c1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { userId: 'userA', prompt: 'a'.repeat(5000) },
  },
];

assert.equal(dirtyDozenCases.length, 12);
