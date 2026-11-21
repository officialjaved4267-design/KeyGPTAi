# KeyAi Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: All unmatched Firestore paths deny read and write operations.
2. **Self-Modification Prevention**: Normal users can create their own profile ONLY with `role == 'user'`, `credits == 50`, `unlimitedCredits == false`, and `status == 'active'`. They can NEVER modify `credits`, `role`, `unlimitedCredits`, `status`, or `lastCreditReset`.
3. **Immutable Ownership & Timestamps**: `uid`, `userId`, `email`, and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` timestamps must match `request.time`.
4. **Master Gate on Subcollections**: `/chat_sessions/{sessionId}/messages/{messageId}` always checks the parent `/chat_sessions/{sessionId}` document via `get()` to confirm `userId == request.auth.uid` and `sessionId` matches.
5. **PII Isolation**: User profile documents containing `email` can only be read by the document owner (`request.auth.uid == userId`) or an authorized admin (`isAdmin()`).
6. **Admin Isolation**: Only verified admins (`isAdmin()`) can read/write `/admins/{adminId}`, write `/credit_transactions/{transactionId}`, or list all users.
7. **Verified Auth Requirement**: All non-admin user writes require `request.auth.token.email_verified == true`.
8. **Query Enforcement**: Every `allow list` rule evaluates `resource.data.userId == request.auth.uid` (or `isAdmin()`) without using `get()`/`exists()` inside list rules.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Escalation on Signup**: `POST /users/{uid}` with `{ role: 'super_admin', credits: 999999, unlimitedCredits: true }` -> `PERMISSION_DENIED`.
2. **Credit Self-Boost Update**: `PATCH /users/{uid}` by owner changing `{ credits: 5000 }` -> `PERMISSION_DENIED`.
3. **Unlimited Flag Hijack**: `PATCH /users/{uid}` by owner changing `{ unlimitedCredits: true }` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: `PATCH /users/{uid}` by owner with `{ username: 'alice', isVip: true }` -> `PERMISSION_DENIED`.
5. **Unverified Email Admin Spoof**: Token with `email: 'officialjaved4267@gmail.com'` and `email_verified: false` reading `/admins` -> `PERMISSION_DENIED`.
6. **Cross-User PII Read**: Authenticated user A calling `get(/users/userB)` -> `PERMISSION_DENIED`.
7. **Blanket List Scraping**: Authenticated user A listing `/users` without `uid == auth.uid` -> `PERMISSION_DENIED`.
8. **Fake Transaction Fabrication**: User A creating `/credit_transactions/tx1` with `{ userId: 'userA', amount: 1000 }` -> `PERMISSION_DENIED`.
9. **Orphaned Chat Message**: User A creating `/chat_sessions/sessionOwnedByB/messages/m1` -> `PERMISSION_DENIED` (Master Gate rejects).
10. **Path Variable Poisoning**: Request to `/creations/../../etc/passwd` or 500-char ID -> `PERMISSION_DENIED` (`isValidId` rejects).
11. **Timestamp Backdating**: User A creating `/creations/c1` with `createdAt: '2020-01-01T00:00:00Z'` -> `PERMISSION_DENIED` (`request.time` check rejects).
12. **Resource Exhaustion (1MB String)**: User A creating `/creations/c1` with 200,000-character `prompt` -> `PERMISSION_DENIED` (`prompt.size() <= 2000` rejects).
