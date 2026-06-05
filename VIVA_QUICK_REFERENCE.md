# Restenzo Viva Quick Reference

Use this file for last-minute revision and live demo navigation.

---

## 1) 30-Second Project Pitch

Restenzo is a multi-tenant restaurant SaaS built with Next.js + Prisma + Stripe.  
It has:
- public website + signup onboarding,
- platform admin panel for tenant management,
- role-based operational portals (order taker, kitchen, cashier, accountant, branch admin, restaurant admin),
- strict tenant and branch-level access control.

---

## 2) Core Architecture Snapshot

- **UI routes:** `app/**/page.tsx`
- **Backend handlers:** `app/api/**/route.ts`
- **Auth + RBAC/scoping:** `lib/server-auth.ts`, `lib/auth-client.ts`
- **DB schema:** `prisma/schema.prisma`
- **Billing/onboarding:** `app/api/auth/signup-trial/route.ts`, `app/api/auth/onboarding/confirm/route.ts`, `app/api/stripe/webhook/route.ts`

---

## 3) Role Access Matrix (Fast Memory)

- **SUPER_ADMIN** -> `/dashboard`, `/restaurants`, `/subscriptions`, `/plans`, `/billing`, `/setup-health`, `/support`
- **RESTAURANT_ADMIN (single branch)** -> operations for one branch
- **RESTAURANT_ADMIN (multi branch / head office)** -> cross-branch monitoring + branch management; restricted branch-level writes
- **BRANCH_ADMIN** -> branch operations modules
- **ORDER_TAKER** -> `/create-order`, `/order-deals`
- **LIVE_KITCHEN** -> `/kitchen`
- **CASHIER** -> `/orders`, `/expenses`, `/dayend`
- **ACCOUNTANT** -> `/sales-list`, `/sales-report`, `/menu-sales`, `/expenses` (primarily reporting/finance visibility)

---

## 4) Most Important API Endpoints

- **Signup/Onboarding**
  - `POST /api/auth/signup-trial`
  - `POST /api/auth/onboarding/resume`
  - `POST /api/auth/onboarding/confirm`
  - `POST /api/stripe/webhook`
- **Login**
  - `POST /api/auth/login`
- **Order lifecycle**
  - `GET/POST /api/orders`
  - `PATCH /api/orders/[id]`
- **Branch/Restaurant management**
  - `GET/POST /api/branches`
  - `PUT/DELETE /api/branches/[id]`
  - `GET/POST /api/restaurants`
  - `GET/PUT/DELETE /api/restaurants/[id]`
  - `POST /api/restaurants/[id]/status`
- **Reports/finance**
  - `GET /api/reports/sales-list`
  - `GET /api/reports/sales-report`
  - `GET /api/reports/menu-sales`
  - `GET/POST /api/dayend`
  - `GET /api/dayend/history`
  - `GET/POST /api/expenses`

---

## 5) Core Database Models To Remember

From `prisma/schema.prisma`:
- `Restaurant` (tenant)
- `Branch` (tenant child unit)
- `User` (role + scope assignment)
- `Subscription` (billing/trial)
- `Category`, `MenuItem`, `MenuVariation`
- `Deal`, `DealItem`
- `Hall`, `Table`
- `Order`, `OrderItem`
- `Payment`
- `Expense`, `ExpenseCategory`
- `DayEnd`

Quick relation memory:
- Restaurant -> Branches, Users, Orders, Subscription
- Branch -> Orders, Payments, Expenses, DayEnd, menu/deal/hall/table data
- Order -> OrderItems + Payment flow

---

## 6) Order Lifecycle in One Glance

1. Order Taker creates order -> `POST /api/orders` -> status `Pending`
2. Kitchen updates -> `PATCH /api/orders/[id]` -> `Running`, then `Served`
3. Cashier pays -> `PATCH /api/orders/[id]` with payment payload -> `Paid`
4. Reports/day-end aggregate sales + expenses

Key files:
- `app/create-order/page.tsx`
- `app/kitchen/page.tsx`
- `app/orders/page.tsx`
- `components/orders/CashierPaymentModal.tsx`
- `app/api/orders/route.ts`
- `app/api/orders/[id]/route.ts`

---

## 7) If Professor Asks “Show Me X”, Open These Files

- **RBAC/scoping core**
  - `lib/server-auth.ts`
  - `lib/auth-client.ts`
  - `components/layout/DashboardLayout.tsx`
  - `components/layout/Sidebar.tsx`

- **Signup + Stripe trial**
  - `app/signup/page.tsx`
  - `app/onboarding/page.tsx`
  - `app/api/auth/signup-trial/route.ts`
  - `app/api/stripe/webhook/route.ts`

- **Platform admin**
  - `app/restaurants/page.tsx`
  - `app/api/platform/overview/route.ts`
  - `app/api/restaurants/**`

- **Branch management**
  - `app/branches/page.tsx`
  - `app/api/branches/route.ts`

- **Order taker**
  - `app/create-order/page.tsx`
  - `app/order-deals/page.tsx`

- **Kitchen**
  - `app/kitchen/page.tsx`
  - `app/api/orders/[id]/route.ts`

- **Cashier**
  - `app/orders/page.tsx`
  - `components/orders/CashierPaymentModal.tsx`

- **Reports**
  - `app/sales-list/page.tsx`
  - `app/sales-report/page.tsx`
  - `app/menu-sales/page.tsx`
  - `app/api/reports/**`

- **Day-end**
  - `app/dayend/page.tsx`
  - `app/api/dayend/route.ts`

---

## 8) Rapid Viva Q&A

- **Q: How is multi-tenant isolation enforced?**  
  A: Tenant and branch scope are enforced in backend auth helpers (`lib/server-auth.ts`) and not only in UI.

- **Q: Where is role-based routing done?**  
  A: Client allowlists and redirects are in `lib/auth-client.ts` + `DashboardLayout`, with server API enforcement in `lib/server-auth.ts`.

- **Q: How are inactive branches blocked?**  
  A: API write guards reject writes when branch/restaurant is inactive; UI also shows inactive banner via branch-status polling.

- **Q: Where does cashier payment logic happen?**  
  A: UI in `components/orders/CashierPaymentModal.tsx`, backend transition and payment write in `app/api/orders/[id]/route.ts`.

- **Q: How are reports generated?**  
  A: Report endpoints in `app/api/reports/**` query scoped order/payment data and return aggregated response for report pages.

- **Q: What controls single vs multi branch behavior?**  
  A: `Restaurant.has_multiple_branches` plus role-mode checks in auth/scoping helpers.

---

## 9) Final Pre-Viva Reading Order (Fast)

1. `lib/server-auth.ts`
2. `lib/auth-client.ts`
3. `prisma/schema.prisma`
4. `app/api/orders/route.ts`
5. `app/api/orders/[id]/route.ts`
6. `app/api/auth/signup-trial/route.ts`
7. `app/api/stripe/webhook/route.ts`
8. `app/api/reports/sales-report/route.ts`
9. `app/api/dayend/route.ts`
