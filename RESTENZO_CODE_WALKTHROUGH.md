# Restenzo Code Walkthrough (Viva Preparation)

This document is a deep, code-based explanation of the Restenzo project for viva preparation.
It is written to help you quickly understand:
- what the system does,
- how each module is implemented,
- how role/branch/restaurant scoping works,
- how APIs and database models connect,
- and where to open code during a live demo.

---

## 1) Project Overview

## What Restenzo is
Restenzo is a restaurant SaaS platform built with Next.js App Router + Prisma + Stripe.
It supports:
- public marketing website,
- SaaS tenant signup and trial onboarding,
- platform admin controls (Restenzo owner side),
- restaurant operational portals with role-based access.

## High-level architecture
- **Frontend + API in same codebase:** Next.js pages and API routes are both inside `app`.
- **Database access:** Prisma models in `prisma/schema.prisma`.
- **Authentication model:** token-based session data managed in client storage and validated server-side.
- **Authorization/scoping model:** strict restaurant and branch scoping in backend auth helpers.
- **Billing model:** Stripe setup/trial onboarding + webhook-driven subscription synchronization.

## How SaaS onboarding works
1. User signs up from `app/signup/page.tsx`.
2. Backend provisions tenant/admin via `app/api/auth/signup-trial/route.ts`.
3. User completes payment method setup in onboarding pages (`app/onboarding/**`).
4. Confirmation + webhook activate tenant/admin.
5. User logs in via `app/login/page.tsx` and gets role-based landing.

## Single branch vs multi branch concept
- **Single branch tenant:** `Restaurant.has_multiple_branches = false`, one default branch flow.
- **Multi branch tenant:** `Restaurant.has_multiple_branches = true`, head office can monitor multiple branches, branch-level operations are handled by branch roles.

## Platform admin vs customer portals
- **Platform admin (SUPER_ADMIN):** manages restaurants, subscriptions, plans, billing, setup health, support.
- **Customer side:** restaurant and staff roles use operational modules (orders, kitchen, cashier, reports, etc.) with RBAC and branch locks.

---

## 2) Folder Structure Explanation

## `app/`
Contains Next.js App Router pages and backend handlers.
- `app/(site)/**`: public marketing and legal pages.
- `app/api/**`: all API routes (auth, billing, ops, reports, platform).
- `app/*/page.tsx`: operational dashboards and role-based modules.

Why it exists: this is the main application layer where UI routes and server handlers live together.

## `components/`
Reusable UI and module-specific components.
- Examples: `components/orders/**`, `components/kitchen/**`, `components/platform/**`, `components/site/**`.
- Includes layout controls such as `components/layout/Sidebar.tsx` and `components/layout/DashboardLayout.tsx`.

Why it exists: separates UI composition from route files and keeps modules maintainable.

## `lib/`
Shared business helpers and infrastructure logic.
- Auth/scoping: `lib/server-auth.ts`, `lib/auth-client.ts`, `lib/use-branch-status.ts`.
- Billing/platform helpers: `lib/stripe.ts`, `lib/pricing.ts`, `lib/platform.ts`.
- Operational helpers: `lib/bill-number.ts`, `lib/order-taker-cart.ts`, export utilities.

Why it exists: centralizes logic that multiple pages/APIs need.

## `prisma/`
Database schema and migration/seed related files.
- Main model map: `prisma/schema.prisma`.

Why it exists: single source of truth for data structure.

## `types/`
TypeScript type contracts used across pages/components/APIs.

Why it exists: shared typing improves consistency and reduces runtime mistakes.

---

## 3) Important File-by-File Explanation (High-Value Files)

Below are the most viva-relevant files (not trivial files).

## Auth, Access, and Scoping Core

- **`lib/server-auth.ts`**
  - Does: server-side auth validation, role normalization, restaurant/branch access control, active/inactive guard checks, write-access control.
  - Important because: this is the backend source of truth for permissions and scoping.
  - Depends on: API routes across orders/menu/expenses/dayend/reports.
  - Workflow: every serious API enforces access through this file.

- **`lib/auth-client.ts`**
  - Does: client-side session utilities, route allowlists per role, branch lock behavior, operational read-only mode helpers.
  - Important because: controls menu visibility and client route behavior.
  - Depends on: `DashboardLayout`, `Sidebar`, most role-based pages.

- **`components/layout/DashboardLayout.tsx`**
  - Does: top-level app shell; redirects disallowed route access; mounts global inactive branch/restaurant banner.
  - Important because: first line of UI route protection.
  - Depends on: `lib/auth-client.ts`, `lib/use-branch-status.ts`.

- **`components/layout/Sidebar.tsx`**
  - Does: role-based navigation menus.
  - Important because: reflects effective module availability per role.
  - Depends on: session role + tenant mode.

## Signup, Login, Stripe Onboarding

- **`app/signup/page.tsx`**
  - Does: collects tenant/admin details, plan/cycle selection; starts signup trial API call.
  - Important because: entry point of SaaS customer acquisition.

- **`app/api/auth/signup-trial/route.ts`**
  - Does: creates tenant records (`Restaurant`), branch bootstrap (single branch mode), admin user, Stripe trial subscription mirror.
  - Important because: core provisioning pipeline.
  - Depends on: Prisma models + Stripe helpers.

- **`app/onboarding/page.tsx`** and **`components/onboarding/StripeOnboardingForm.tsx`**
  - Do: collect and confirm payment method setup.
  - Important because: activates onboarding completion path.

- **`app/api/auth/onboarding/confirm/route.ts`**
  - Does: finalizes setup intent confirmation and activation logic.

- **`app/api/stripe/webhook/route.ts`**
  - Does: receives Stripe events and updates subscription/restaurant/user activation state.
  - Important because: billing state synchronization.

- **`app/login/page.tsx`** and **`app/api/auth/login/route.ts`**
  - Do: authenticate and produce role-aware session payload; assign default landing path.

## Platform Admin

- **`app/api/platform/overview/route.ts`**
  - Does: core platform overview data for SaaS owner dashboard.
  - Important because: aggregates health/tenant-level visibility.

- **`app/restaurants/page.tsx`** + **`app/api/restaurants/**`**
  - Do: tenant listing, details, status management, lifecycle actions.
  - Important because: platform controls customer tenants.

- **`app/subscriptions/page.tsx`, `app/plans/page.tsx`, `app/billing/page.tsx`, `app/setup-health/page.tsx`, `app/support/page.tsx`**
  - Do: billing/admin operations and support workflows.

## Core Operations (Order Lifecycle)

- **`app/create-order/page.tsx`**
  - Does: Order Taker POS flow (cart, dine-in selections, submit order).
  - Calls: menu/category/halls/deals APIs + `POST /api/orders`.

- **`app/api/orders/route.ts`**
  - Does: fetch orders (`GET`) and create order (`POST`) with dine-in/table logic and validations.
  - DB impact: `Order`, `OrderItem`, `Table`, plus catalog/deal reads.

- **`app/kitchen/page.tsx`**
  - Does: kitchen board for pending/running/served views and status transitions.
  - Calls: `GET /api/orders`, `PATCH /api/orders/[id]`.

- **`app/api/orders/[id]/route.ts`**
  - Does: order state transitions (kitchen and cashier), billing fields, payment row creation, table release.
  - DB impact: `Order`, `Payment`, `Table`.

- **`app/orders/page.tsx`** + **`components/orders/CashierPaymentModal.tsx`**
  - Do: cashier served-to-paid flow with discounts/GST/service charge and receipt-related UI.

## Reports, Finance, Day End

- **`app/api/reports/sales-list/route.ts`** + `app/sales-list/page.tsx`
  - Sales order listing and filtering.

- **`app/api/reports/sales-report/route.ts`** + `app/sales-report/page.tsx`
  - KPI and daily summary style report.

- **`app/api/reports/menu-sales/route.ts`** + `app/menu-sales/page.tsx`
  - Item-level performance and revenue contribution.

- **`app/api/expenses/**`** + `app/expenses/page.tsx`
  - Expense CRUD/list logic with role constraints.

- **`app/api/dayend/route.ts`**, **`app/api/dayend/history/route.ts`**, `app/dayend/page.tsx`
  - Day closure summary, persistence, and history lookup.

## Schema Source

- **`prisma/schema.prisma`**
  - Does: full relational model for tenant, operations, and billing.
  - Important because: viva-level model explanation should always map to this file.

---

## 4) Module-wise Explanation

## A) Public Website
Who uses it: visitors/prospects.

What it does:
- marketing, pricing, features, how-it-works, legal and contact pages,
- redirects users toward signup/login.

How it works technically:
- route group under `app/(site)/**`,
- shared site layout + navbar/footer components.

Important files:
- `app/(site)/page.tsx`
- `app/(site)/features/page.tsx`
- `app/(site)/pricing/page.tsx`
- `app/(site)/how-it-works/page.tsx`
- `app/(site)/about/page.tsx`
- `app/(site)/faq/page.tsx`
- `app/(site)/terms/page.tsx`
- `app/(site)/privacy/page.tsx`
- `components/site/**`

## B) Restenzo Platform Admin
Who uses it: `SUPER_ADMIN`.

What it does:
- SaaS-level dashboard,
- restaurant management,
- subscription/billing/plans/setup health/support controls.

How it works technically:
- route allowlist for `SUPER_ADMIN` in `lib/auth-client.ts`,
- menu definitions in `components/layout/Sidebar.tsx`,
- data aggregation via `app/api/platform/overview/route.ts`.

Important files:
- `app/dashboard/page.tsx` (platform branch)
- `app/restaurants/page.tsx`
- `app/subscriptions/page.tsx`
- `app/plans/page.tsx`
- `app/billing/page.tsx`
- `app/setup-health/page.tsx`
- `app/support/page.tsx`
- `app/api/platform/overview/route.ts`
- `app/api/restaurants/**`

## C) Single Branch Portal
Who uses it: `RESTAURANT_ADMIN` for single-branch tenant and branch staff.

What it does:
- day-to-day operations for one branch: setup, orders, kitchen, cashier, reports, day-end.

How it works technically:
- single-branch tenant mode derived from restaurant flags,
- branch is effectively fixed/default in session and server filters.

Important files:
- pages: `app/dashboard/page.tsx`, `app/categories/page.tsx`, `app/menu/page.tsx`, `app/deals/page.tsx`, `app/halls/page.tsx`, `app/orders/page.tsx`, `app/kitchen/page.tsx`, `app/sales-list/page.tsx`, `app/sales-report/page.tsx`, `app/menu-sales/page.tsx`, `app/expenses/page.tsx`, `app/dayend/page.tsx`, `app/roles/page.tsx`
- APIs: `app/api/orders/**`, `app/api/menu/**`, `app/api/categories/**`, `app/api/deals/**`, `app/api/halls/**`, `app/api/expenses/**`, `app/api/dayend/**`, `app/api/reports/**`

## D) Multi Branch Head Office
Who uses it: `RESTAURANT_ADMIN` in multi-branch tenants.

What it does:
- branch-level oversight, branch management, analytics/monitoring.

How it works technically:
- can view and select branches across tenant,
- operational write actions are restricted in multi-branch RA mode (read-only for branch-scoped operations),
- enforced by server auth logic.

Important files:
- `app/dashboard/page.tsx` (head-office branch)
- `app/branches/page.tsx`
- `app/api/branches/**`
- `lib/server-auth.ts` (`getOperationalEditMode`, write access checks)

## E) Multi Branch Branch Admin
Who uses it: `BRANCH_ADMIN`.

What it does:
- operational control for one assigned branch.

How it works technically:
- allowed paths set for branch admin,
- server forcibly scopes all actions to assigned branch id.

Important files:
- `app/dashboard/page.tsx` (branch admin branch)
- operational pages same family as single-branch
- `lib/server-auth.ts` branch scope helpers

## F) Order Taker
Who uses it: `ORDER_TAKER`.

What it does:
- POS/new order creation, including deals and hall/table selection.

How it works technically:
- data loading for menu/catalog/hall table availability,
- order post payload sent to `POST /api/orders`,
- cart persistence helper.

Important files:
- `app/create-order/page.tsx`
- `app/order-deals/page.tsx`
- `lib/order-taker-cart.ts`
- `app/api/orders/route.ts`

## G) Live Kitchen
Who uses it: `LIVE_KITCHEN` (and monitored by higher roles).

What it does:
- shows kitchen queue and updates processing state.

How it works technically:
- polls orders API,
- updates statuses through patch endpoint (`Pending -> Running -> Served`).

Important files:
- `app/kitchen/page.tsx`
- `app/api/orders/route.ts`
- `app/api/orders/[id]/route.ts`

## H) Cashier
Who uses it: `CASHIER`.

What it does:
- receives served orders, applies discount/GST/service logic, marks paid, produces receipt flow.

How it works technically:
- uses orders list + payment modal,
- sends paid update through `PATCH /api/orders/[id]`,
- payment row is persisted.

Important files:
- `app/orders/page.tsx`
- `components/orders/CashierPaymentModal.tsx`
- `components/orders/PaidReceiptModal.tsx`
- `app/api/orders/[id]/route.ts`

## I) Accountant
Who uses it: `ACCOUNTANT`.

What it does:
- finance and reporting visibility (sales list/report/menu sales/expenses viewing).

How it works technically:
- route restrictions prevent operational modules,
- expense mutation controls are limited by role policy.

Important files:
- `app/sales-list/page.tsx`
- `app/sales-report/page.tsx`
- `app/menu-sales/page.tsx`
- `app/expenses/page.tsx`
- `app/api/reports/**`

---

## 5) API / Backend Handler Explanation

This section focuses on major APIs relevant for viva.

## Auth and Onboarding APIs

### `POST /api/auth/signup-trial`
- File: `app/api/auth/signup-trial/route.ts`
- Purpose: create trial tenant setup.
- Input: tenant/admin details + plan/cycle.
- Output: tenant/user/subscription context + Stripe onboarding data.
- Logic: creates `Restaurant`, optional default `Branch`, `User`, `Subscription`; integrates Stripe trial setup.
- Called by: `app/signup/page.tsx`.

### `POST /api/auth/login`
- File: `app/api/auth/login/route.ts`
- Purpose: authentication and session payload generation.
- Input: `identifier`, `password`.
- Output: role and scope-rich session object, token.
- Logic: validates credentials, checks onboarding/active status, resolves branch context.
- Called by: `app/login/page.tsx`.

### `POST /api/auth/onboarding/resume`
- File: `app/api/auth/onboarding/resume/route.ts`
- Purpose: resume interrupted onboarding.
- Called by: signup/login onboarding continuation flows.

### `POST /api/auth/onboarding/confirm`
- File: `app/api/auth/onboarding/confirm/route.ts`
- Purpose: confirm setup completion and activate access.
- DB: updates restaurant onboarding fields and admin activation states.

### `POST /api/stripe/webhook`
- File: `app/api/stripe/webhook/route.ts`
- Purpose: receives Stripe lifecycle events.
- Logic: syncs local subscription + activation/deactivation effects.
- DB: primarily `Subscription`, also restaurant/user activation logic.

## Tenant and Branch Management APIs

### `app/api/restaurants/**`
- Purpose: platform-level tenant CRUD and status actions.
- Key DB: `Restaurant`, `Subscription`, `Branch`, `User`, and related cascade dependencies.
- Frontend: `app/restaurants/page.tsx`, `app/support/page.tsx`.

### `app/api/branches/**`
- Purpose: branch CRUD and status control in tenant scope.
- Key DB: `Branch`, related staff assignment context.
- Frontend: `app/branches/page.tsx`.

### `app/api/users/**`
- Purpose: role/staff management.
- Key logic: role-creation restrictions differ by acting role and tenant mode.
- Frontend: `app/roles/page.tsx`, `app/users/page.tsx`.

## Orders, Kitchen, Cashier APIs

### `GET/POST /api/orders`
- File: `app/api/orders/route.ts`
- GET purpose: fetch orders with filters/scoping.
- POST purpose: create new orders.
- Input (POST): order type, branch, optional hall/table, item/deal lines.
- Output: created order data / order list.
- Logic: table occupancy checks for dine-in, item normalization, branch write guards.
- DB: `Order`, `OrderItem`, `Table`, `Hall`, `MenuItem`, `Category`, `Deal`.
- Frontend: `app/create-order/page.tsx`, `app/orders/page.tsx`, `app/kitchen/page.tsx`.

### `PATCH /api/orders/[id]`
- File: `app/api/orders/[id]/route.ts`
- Purpose: status transitions and payment finalization.
- Input variants:
  - kitchen: status updates (`Running`, `Served`)
  - cashier: paid payload (payment method, discount, GST, etc.)
- Output: updated order with billing/payment details.
- DB: `Order`, `Payment`, `Table`.
- Frontend: `app/kitchen/page.tsx`, `components/orders/CashierPaymentModal.tsx`.

## Expense / Report / Day-End APIs

### `GET/POST /api/expenses` and `PUT/DELETE /api/expenses/[id]`
- Files: `app/api/expenses/route.ts`, `app/api/expenses/[id]/route.ts`
- Purpose: expenses listing and mutation.
- DB: `Expense`, `ExpenseCategory`, `Branch`, `User`.
- Frontend: `app/expenses/page.tsx`.

### `GET /api/reports/sales-list`
- File: `app/api/reports/sales-list/route.ts`
- Purpose: sales order listing details and filters.
- Frontend: `app/sales-list/page.tsx`.

### `GET /api/reports/sales-report`
- File: `app/api/reports/sales-report/route.ts`
- Purpose: summary KPI report over date/branch scope.
- Frontend: `app/sales-report/page.tsx`.

### `GET /api/reports/menu-sales`
- File: `app/api/reports/menu-sales/route.ts`
- Purpose: menu-level performance analytics.
- Frontend: `app/menu-sales/page.tsx`.

### `GET/POST /api/dayend` and `GET /api/dayend/history`
- Files: `app/api/dayend/route.ts`, `app/api/dayend/history/route.ts`
- Purpose: compute and persist day close snapshots, then list history.
- DB: `DayEnd`, `Order`, `OrderItem`, `Expense`, `Branch`, `User`.
- Frontend: `app/dayend/page.tsx`.

## Session/Restriction API

### `GET /api/session/branch-status`
- File: `app/api/session/branch-status/route.ts`
- Purpose: communicate active/inactive restaurant/branch state to UI.
- Frontend: `lib/use-branch-status.ts`, `components/layout/BranchInactiveBanner.tsx`.

---

## 6) Database / Schema Explanation (Viva-Friendly)

Main schema file: `prisma/schema.prisma`.

## Core entity groups

### Tenant/Billing Group
- **`Restaurant`**: tenant root, stores status, branch mode (`has_multiple_branches`), onboarding completion.
- **`Subscription`**: one-to-one tenant billing/trial and Stripe metadata.
- **`Branch`**: child operational unit under a restaurant; has own active/inactive state.
- **`User`**: login identity + role + restaurant/branch assignment.

### Catalog/Configuration Group
- **`Category`**: branch category container.
- **`MenuItem`** and **`MenuVariation`**: sellable products and variation pricing.
- **`Deal`** and **`DealItem`**: bundled offers.
- **`Hall`** and **`Table`**: dine-in floor/table structure and occupancy status.

### Operational/Financial Group
- **`Order`**: main transaction (status, totals, branch + restaurant ownership).
- **`OrderItem`**: line-level sold items for each order.
- **`Payment`**: payment record linked to order (method/status/reference).
- **`Expense`** and **`ExpenseCategory`**: expense tracking.
- **`DayEnd`**: branch-day close snapshot.

## Key relationships (easy memory model)
- One `Restaurant` -> many `Branch`.
- One `Restaurant` -> many `User`, many `Order`.
- One `Branch` -> many `User`, `Order`, `Payment`, `Expense`, `DayEnd`, and catalog records.
- One `Order` -> many `OrderItem`; one or more payment lifecycle records by flow.
- One `Deal` -> many `DealItem` (deal contents).
- One `Hall` -> many `Table`.

## How single vs multi branch is represented in schema
- Stored at restaurant level using `has_multiple_branches`.
- Role/session logic then decides whether user has read-only head office behavior or branch-operational behavior.

---

## 7) Role and Permission Flow

## Who can access what
Client-level route sets and sidebars are role-specific via:
- `lib/auth-client.ts`
- `components/layout/Sidebar.tsx`
- `components/layout/DashboardLayout.tsx`

Roles used:
- `SUPER_ADMIN`
- `RESTAURANT_ADMIN`
- `BRANCH_ADMIN`
- `ORDER_TAKER`
- `LIVE_KITCHEN`
- `CASHIER`
- `ACCOUNTANT`

## How route protection works
1. Login creates session object.
2. Client route guard checks allowed paths and redirects.
3. Sidebar only renders permitted modules.
4. Even if UI is bypassed, backend APIs re-check authorization and scope.

## How branch scoping works
Backend helper `buildBranchScopeFilter` in `lib/server-auth.ts` ensures:
- branch-scoped roles are pinned to assigned branch,
- query params cannot escape assigned branch.

## How restaurant scoping works
Non-super-admin users are tied to a tenant and cannot read/write another restaurant’s data.

## Inactive restaurant / inactive branch logic
- Server functions like `assertRestaurantActive`, `assertBranchActive`, and write guard calls block updates (locked behavior).
- UI hook `lib/use-branch-status.ts` polls `GET /api/session/branch-status`.
- `components/layout/BranchInactiveBanner.tsx` displays global restriction alerts.

---

## 8) End-to-End Workflow Explanation

## A) Website / SaaS flow
Visitor -> Pricing -> Signup -> Payment setup -> Trial -> Portal access

Step-by-step:
1. Visit public site pages under `app/(site)/**`.
2. Start signup in `app/signup/page.tsx`.
3. `POST /api/auth/signup-trial` provisions tenant + admin + trial records.
4. Onboarding UI in `app/onboarding/page.tsx` + `components/onboarding/StripeOnboardingForm.tsx`.
5. `POST /api/auth/onboarding/confirm` and Stripe webhook finalize activation.
6. Login through `app/login/page.tsx`, then role-based dashboard redirect.

## B) Single branch operational flow
Restaurant admin creates staff -> Order taker places order -> Kitchen updates -> Cashier marks paid -> Reports update

1. Staff/roles managed via `app/roles/page.tsx` and `app/api/users/**`.
2. Order Taker uses `app/create-order/page.tsx`, submits to `POST /api/orders`.
3. Kitchen uses `app/kitchen/page.tsx`, updates via `PATCH /api/orders/[id]`.
4. Cashier uses `app/orders/page.tsx` + payment modal, marks `Paid`.
5. Reports and day-end update through `app/api/reports/**` and `app/api/dayend/**`.

## C) Multi branch flow
Signup -> Head office -> Branches -> Branch admin -> Branch staff -> Orders/reports

1. Tenant created with `has_multiple_branches=true`.
2. Head office (`RESTAURANT_ADMIN`) uses `app/branches/page.tsx` and analytics overview.
3. Branch admins assigned via user/role APIs.
4. Branch admin and staff operate branch-level modules.
5. Head office monitors using branch filters and dashboards.

## D) Payment/trial flow
Signup -> Incomplete onboarding -> Payment setup -> Trial starts -> Login activation

Core files:
- `app/api/auth/signup-trial/route.ts`
- `app/api/auth/onboarding/resume/route.ts`
- `app/api/auth/onboarding/confirm/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/login/page.tsx`

## E) Order lifecycle flow
Pending -> Running -> Served -> Paid (plus reporting of cancelled states where applicable)

Core files:
- create/list: `app/api/orders/route.ts`
- transitions: `app/api/orders/[id]/route.ts`
- live kitchen UI: `app/kitchen/page.tsx`
- cashier flow: `app/orders/page.tsx`, `components/orders/CashierPaymentModal.tsx`

---

## 9) Possible Viva Questions and Answers

## 1. Where is the order taker module in your code?
Order Taker is mainly in `app/create-order/page.tsx` and `app/order-deals/page.tsx`, with backend creation handled in `app/api/orders/route.ts`.

## 2. How does branch scoping work?
Backend enforces branch scoping in `lib/server-auth.ts` using branch-aware access helpers and scope filters, so branch roles cannot access other branches even if frontend params are changed.

## 3. How does multi-branch differ from single-branch in code?
`Restaurant.has_multiple_branches` decides behavior. Multi-branch restaurant admin acts as head office with restricted operational writes, while single-branch mode is effectively one-branch operational.

## 4. How is Stripe integrated?
Signup and onboarding call auth/onboarding routes, Stripe setup is handled during onboarding, and lifecycle sync is handled in `app/api/stripe/webhook/route.ts`.

## 5. How is the live kitchen updated?
Kitchen page (`app/kitchen/page.tsx`) polls orders and updates states through `PATCH /api/orders/[id]` for `Pending -> Running -> Served`.

## 6. How do you restrict inactive branches?
Server checks active status via auth guard functions and rejects writes. UI also polls branch status and shows restriction banners/disabled actions.

## 7. How are reports generated?
Reports are API-driven from order/expense/payment data using report endpoints under `app/api/reports/**` and shown in `sales-list`, `sales-report`, and `menu-sales` pages.

## 8. How does cashier flow work?
Cashier sees served orders, opens payment modal, applies discount/tax/service logic, then marks order paid via `PATCH /api/orders/[id]`, which also persists payment records.

## 9. How is role-based access implemented?
Client route allowlists + sidebar menus are role-aware (`lib/auth-client.ts`, `Sidebar.tsx`, `DashboardLayout.tsx`), and backend enforces real security in `lib/server-auth.ts`.

## 10. What is the overall architecture?
Monorepo-style Next.js app where pages and API handlers coexist, Prisma handles DB, Stripe handles billing/trials, and RBAC/scoping controls tenant and branch isolation.

---

## 10) If Professor Asks “Show Me This Feature, Where Should You Open?”

- **Order Taker module**
  - Page: `app/create-order/page.tsx`
  - Related page: `app/order-deals/page.tsx`
  - API: `app/api/orders/route.ts`

- **Cashier module**
  - Page: `app/orders/page.tsx`
  - Components: `components/orders/CashierPaymentModal.tsx`, `components/orders/PaidReceiptModal.tsx`
  - API: `app/api/orders/[id]/route.ts`

- **Live Kitchen module**
  - Page: `app/kitchen/page.tsx`
  - API: `app/api/orders/[id]/route.ts`

- **Signup/Stripe flow**
  - Pages: `app/signup/page.tsx`, `app/onboarding/page.tsx`, `app/onboarding/success/page.tsx`
  - APIs: `app/api/auth/signup-trial/route.ts`, `app/api/auth/onboarding/confirm/route.ts`, `app/api/stripe/webhook/route.ts`

- **Head Office branches flow**
  - Page: `app/branches/page.tsx`
  - APIs: `app/api/branches/route.ts`, `app/api/branches/[id]/route.ts`

- **Roles and permissions**
  - `lib/server-auth.ts`
  - `lib/auth-client.ts`
  - `components/layout/DashboardLayout.tsx`
  - `components/layout/Sidebar.tsx`

- **Reports**
  - Pages: `app/sales-list/page.tsx`, `app/sales-report/page.tsx`, `app/menu-sales/page.tsx`
  - APIs: `app/api/reports/sales-list/route.ts`, `app/api/reports/sales-report/route.ts`, `app/api/reports/menu-sales/route.ts`

- **Day End**
  - Page: `app/dayend/page.tsx`
  - APIs: `app/api/dayend/route.ts`, `app/api/dayend/history/route.ts`

---

## 11) Quick Study Strategy (What to Read First for Viva)

If time is short, use this order:
1. `lib/server-auth.ts` + `lib/auth-client.ts` (RBAC/scoping backbone)
2. `prisma/schema.prisma` (data model backbone)
3. `app/api/orders/route.ts` and `app/api/orders/[id]/route.ts` (core lifecycle)
4. `app/kitchen/page.tsx` + `app/orders/page.tsx` + `components/orders/CashierPaymentModal.tsx` (operational UI)
5. `app/api/auth/signup-trial/route.ts` + `app/api/stripe/webhook/route.ts` (SaaS onboarding/billing)
6. `app/api/reports/**` + `app/api/dayend/**` (analytics/reporting closure)
7. `app/dashboard/page.tsx` + `components/layout/Sidebar.tsx` (role-specific portal behavior)

---

## Final Notes

- This walkthrough is based on actual project files and module connections.
- It focuses on viva-relevant architecture, flows, and explanations.
- It intentionally avoids refactoring or changing business logic.
