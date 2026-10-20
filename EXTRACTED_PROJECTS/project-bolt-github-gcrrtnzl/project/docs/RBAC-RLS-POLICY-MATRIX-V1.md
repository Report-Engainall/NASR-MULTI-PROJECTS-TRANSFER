# Aghbari — RBAC/RLS Policy Matrix V1

**Status:** implementation-ready candidate; final freeze remains blocked on Batch 3 reconciliation.

## 1. Security model
Authorization is deny-by-default and enforced independently at the API/service boundary and database boundary. UI visibility is never an authorization mechanism.

Scope hierarchy:
`organization → branch → warehouse → resource`

Customer scope is additionally constrained to the authenticated customer identity. Privileged roles receive only the minimum scope assigned to them.

## 2. Roles
| Role | Primary scope | Core responsibility |
|---|---|---|
| system_admin | organization | platform administration and security |
| sales_manager | assigned branches | sales/customer/order supervision |
| sales_employee | assigned branch | day-to-day sales operations |
| warehouse_manager | assigned warehouses | inventory and warehouse operations |
| warehouse_keeper | assigned warehouse | stock movements and preparation |
| accountant | assigned organization/branches | operational financial records |
| moderator | assigned branches | customer/order moderation |
| customer | own customer identity | own catalog, cart, orders, profile |

## 3. Policy rules
- No role receives implicit access because it can navigate to a route.
- Every material command evaluates actor, role, scope, target resource, and operation.
- Customers cannot enumerate other customer IDs, orders, prices, or private profile data.
- Customer-facing product pricing returns only the authorized price context.
- Administrative pricing views may expose multiple tiers only to explicitly authorized roles.
- Warehouse operations require warehouse scope; branch access alone is insufficient.
- Cross-branch and cross-warehouse access is denied unless explicitly assigned.
- Financial records require accountant or higher privileged authorization according to operation.
- System administration is not granted to operational roles by default.

## 4. Resource/action matrix
| Resource | Customer | Sales Employee | Sales Manager | Warehouse Keeper | Warehouse Manager | Accountant | Moderator | System Admin |
|---|---|---|---|---|---|---|---|---|
| own profile | CRUD | - | - | - | - | - | - | scoped admin |
| products/catalog | R | R | CRUD | R | CRUD | R | R | CRUD |
| customer records | own R | scoped R | scoped CRUD | limited R | limited R | scoped R | scoped CRUD | CRUD |
| pricing | own effective R | scoped R | scoped CRUD | R | R | R | R | CRUD |
| carts | own CRUD | limited R | scoped R | - | - | - | limited R | scoped support |
| orders | own CRUD/submit | scoped CRUD/status | scoped CRUD/status | scoped preparation/status | scoped CRUD/status | scoped R | scoped moderation | CRUD |
| inventory balance | own none | R | R | scoped R | scoped CRUD | R | R | CRUD |
| inventory movements | none | limited R | scoped R | scoped create/R | scoped CRUD/R | scoped R | R | CRUD |
| purchases | none | - | R | scoped R | scoped CRUD | scoped CRUD | - | CRUD |
| operational finance | none | - | limited R | - | - | scoped CRUD | - | CRUD |
| notifications | own R | scoped R/create | scoped CRUD | scoped R/create | scoped CRUD | scoped R | scoped CRUD | CRUD |
| imports/exports | own exports where allowed | limited scoped | scoped | warehouse scoped | warehouse scoped | finance scoped | limited | CRUD |
| integrations | none | - | scoped R | - | limited R | limited R | - | CRUD |
| audit events | own relevant | limited scoped | scoped R | scoped R | scoped R | scoped R | scoped R | organization R |
| roles/permissions | - | - | - | - | - | - | - | CRUD |
| system settings | - | - | limited operational | - | limited warehouse | limited finance | - | CRUD |

## 5. Field-level protection
Sensitive fields are not merely hidden in the UI. They are excluded from unauthorized API projections and protected by service policy.

Examples:
- alternative customer-tier prices: never returned to a customer;
- password/session/security material: never returned through business APIs;
- internal integration credentials: server-only;
- private customer contact/account metadata: scope-filtered;
- internal audit/security metadata: privileged projection only.

## 6. RLS design
RLS policies must derive authorization context from trusted server/session claims and database-side scope resolution. Client-supplied `organization_id`, `branch_id`, `warehouse_id`, or `customer_id` cannot expand authority.

Policies should be written per table and tested against positive and negative cases. Core policy classes:
1. organization membership;
2. branch assignment;
3. warehouse assignment;
4. customer self-scope;
5. privileged operational scope;
6. system administration.

## 7. Adversarial security tests
Required tests include:
- guessed UUID access;
- changing scope IDs in requests;
- changing customer IDs;
- changing price-list/tier IDs;
- direct invocation of privileged commands;
- cross-branch reads/writes;
- cross-warehouse inventory mutation;
- replaying a successful mutation;
- manipulating hidden fields;
- bypassing UI controls with direct HTTP calls;
- accessing soft-deleted records;
- unauthorized export/import;
- attempting to infer forbidden resources through error differences.

## 8. Operational rule
A permission is considered implemented only when both service authorization and database authorization enforce it and a negative test demonstrates that a direct unauthorized request fails.

## 9. Freeze gate
The matrix becomes final only after Batch 3 reconciliation, exact schema names are frozen, and every policy has corresponding automated authorization/RLS evidence.
