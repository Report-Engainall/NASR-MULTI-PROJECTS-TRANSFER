# Aghbari — Security, RBAC & Data Authorization Baseline

**Status:** Phase-0 engineering baseline; implementation-neutral.

## 1. Security model
Authorization is defense in depth:
`UI → API authorization → domain policy → database authorization → audit`.

A UI hiding a control is never authorization.

## 2. Identity
Use secure server-managed sessions/tokens appropriate to the selected stack. Authentication state must be validated server-side for every protected command/query. Passwords are never stored or logged in plaintext.

## 3. RBAC baseline
Initial business roles:
- System Administrator
- Sales Manager
- Sales Employee
- Warehouse Manager / Keeper
- Accountant

Roles are coarse-grained capabilities. Sensitive operations additionally require explicit domain policies and scope checks. Avoid the legacy approach of exposing dozens of UI-only permissions as the security model.

## 4. Scope model
Every protected data access is evaluated against the applicable organization/tenant, branch, warehouse, and customer scope. Scope must be derived from trusted server-side identity and policy context, not from arbitrary client-supplied IDs.

## 5. Customer isolation
A customer may access only its own profile, authorized catalog/pricing context, cart, orders, and notifications. Customer tier is an authorization input, not public profile data.

## 6. Pricing secrecy
Never return alternative tier prices to a customer and rely on frontend filtering. The server/database boundary must prevent unauthorized price rows or fields from being disclosed.

## 7. RLS baseline
Where PostgreSQL Row Level Security is used, policies must enforce the same scope model as application authorization. `USING` protects visible/target rows and `WITH CHECK` protects inserted/updated rows. RLS is defense in depth, not a substitute for domain authorization.

Security tests must attempt direct endpoint/RPC access, manipulated identifiers, cross-customer reads, cross-branch reads, unauthorized writes, and privilege escalation.

## 8. Administrative controls
High-impact operations require explicit authorization and audit evidence:
- customer approval/tier changes
- account suspension/reactivation
- price changes
- stock adjustments
- order cancellation/status overrides
- import commit
- integration retry/manual replay
- role/permission changes
- security/settings changes

## 9. Input and browser security
Validate at trust boundaries; use parameterized database access; encode untrusted output; enforce appropriate CSRF protections where cookie-authenticated state changes are used; apply CSP and security headers; isolate secrets to server-side environments.

## 10. Audit
Audit events must identify actor, action, target, scope, result, timestamp, correlation ID, and relevant before/after state without storing secrets. Security-sensitive failures are observable.

## 11. Abuse controls
Authentication, registration, password recovery, invitation redemption, order creation, bulk operations, and integration endpoints require rate limiting and abuse-resistant behavior appropriate to risk.

## 12. File/import security
Uploaded files are untrusted input. Validate size/type/content, isolate processing, sanitize spreadsheet formulas where exports could be opened in spreadsheet software, and never allow uploaded data to bypass authorization or staged validation.

## 13. Certification gates
Security is verified through:
`static review → unit policy tests → database/RLS tests → direct API authorization tests → cross-scope adversarial tests → E2E → runtime evidence`.

## 14. Decision
Adopt server-enforced authorization, scoped access, least privilege, defense-in-depth database policies, explicit auditability, and adversarial direct-endpoint testing as non-negotiable security architecture.
