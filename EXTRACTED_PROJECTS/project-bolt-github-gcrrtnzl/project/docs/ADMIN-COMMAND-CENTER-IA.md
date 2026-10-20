# Aghbari — Operational Admin Command Center IA

**Status:** Phase-0 baseline; analytics intentionally delegated to Report-Advisor.

## 1. Product rule
The admin home is an operational command center, not a BI dashboard. It answers: **what requires action now?**

## 2. Primary navigation
1. Command Center
2. Orders
3. Customers
4. Catalog & Products
5. Pricing
6. Inventory
7. Purchasing
8. Promotions
9. Imports & Exports
10. Integrations
11. Notifications
12. Audit & Security
13. Settings

## 3. Command Center cards
Only actionable operational signals belong here:
- new orders awaiting handling
- orders blocked by operational issue
- low/near-out-of-stock items
- pending customer approvals
- price changes awaiting action
- failed integrations / retry queue
- imports requiring validation or correction
- operational notifications requiring acknowledgement

## 4. Deliberate exclusion
Do not duplicate Report-Advisor dashboards, forecasts, advanced BI, executive analytics, Decision Intelligence, or AI reporting. The bridge to Report-Advisor is the correct destination for those capabilities.

## 5. Interaction model
Every alert/card should lead directly to the work queue or record requiring action. Avoid decorative KPI density. Bulk actions require explicit authorization and confirmation where destructive or financially material.

## 6. Orders
The order workspace prioritizes lifecycle state, customer, timestamps, fulfillment blockers, invoice access, notes, and delivery/integration status. Search and filters are task-oriented.

## 7. Customers
Prioritize approval queue, status, contact, recent order context, credit/financial operational context where authorized, and tier assignment. Customer tier remains hidden from customer-facing experiences.

## 8. Inventory
Prioritize low-stock queue, movements, adjustments, warehouse context, pending discrepancies, and safe bulk operations. Analytics remain external.

## 9. Integrations
Provide a delivery/outbox view: pending, processing, retryable failure, terminal failure, and successfully delivered. Manual replay is authorized, audited, and idempotent.

## 10. Responsive behavior
The same information architecture works on desktop and tablet; mobile admin surfaces the highest-priority queues and record actions first rather than attempting to compress every desktop control.

## 11. Decision
Adopt an action-first operational command center with a compact navigation tree, queue-driven workflows, and a strict analytics boundary to Report-Advisor.
