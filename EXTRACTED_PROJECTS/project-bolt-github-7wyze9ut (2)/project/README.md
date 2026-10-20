# Aghbari Commerce | الأغبري

منصة تجارة إلكترونية B2B للمواد الغذائية بالجملة — واجهة عربية RTL متكاملة مع لوحة تحكم إدارية ومتجر للعملاء.

B2B wholesale food commerce platform with Arabic RTL interface, admin control plane, and customer storefront — powered by Supabase.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + custom CSS (Cairo font, RTL layout)
- **Backend:** Supabase (PostgreSQL, RLS, Auth)
- **Icons:** lucide-react

## Getting Started

```bash
npm install
npm run dev      # Development server on port 5173
npm run build    # Production build
npm run typecheck # TypeScript checking
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Project Structure

```
src/
├── App.tsx                    # Admin shell with navigation & dashboard
├── main.tsx                   # React entry point
├── index.css                  # Global styles (RTL, Cairo font, responsive)
├── components/
│   ├── Login.tsx              # Admin login screen
│   ├── Storefront.tsx         # Customer storefront (shop, cart, checkout)
│   ├── AdminPages.tsx         # Shared admin components (notifications, AI, suppliers, settings, order detail, devices)
│   └── OperationsCenter.tsx   # Smart data import engine & inventory reconciliation
├── lib/
│   ├── supabase.ts            # Supabase client + org/warehouse IDs
│   ├── api.ts                 # All data access functions (products, orders, customers, etc.)
│   ├── auth.tsx               # Auth context provider
│   ├── types.ts               # TypeScript type definitions for all entities
│   ├── format.ts              # Arabic number/currency/date formatters
│   └── useFetch.ts            # Generic data fetching hook
└── supabase/migrations/       # Database schema & seed data
```

## Database

Two SQL migrations define the complete schema:
1. `aghbari_core_schema.sql` — 27 tables with RLS enabled (organizations, products, customers, orders, inventory, pricing, promotions, AI alerts/tasks, notifications, import jobs, audit logs, etc.)
2. `aghbari_seed_data.sql` — Demo data (5 customers, 10 products, 5 orders, 3 suppliers, pricing rules, promotions, AI alerts)

## Features Implemented

### Admin Control Plane
- Dashboard with live KPIs (sales, orders, customers, products, low stock, processing)
- Product management (CRUD with categories, inventory, pricing)
- Customer management (approval workflow, tiers, credit limits)
- Order management (list + detail with status workflow)
- Pricing rules engine (priority-based, toggleable)
- Promotions management
- Supplier directory
- Device tracking
- Smart reports (revenue, inventory value, low stock analysis)
- AI center (alerts resolution, task management)
- Notifications (read/unread, mark all)
- Data center (category management)
- Operations center (CSV import pipeline, Onyx analytics, inventory reconciliation, synonym dictionary)
- Settings (general, storefront, appearance with live theme colors)

### Customer Storefront
- Product catalog with category filtering & search
- Product detail pages with stock status
- Wishlist & product comparison (up to 3)
- Shopping cart with quantity controls
- Checkout with customer auto-creation
- Order confirmation
- Configurable hero banner, ticker, promotions
- Responsive mobile-first RTL design

## Next Phase

- Customer auth flows (register, verify, forgot/reset password)
- Order history & reorder templates
- Financial module (statements, invoices, payments, receivables)
- Company profile & address management
- Admin user management & invitations
- AI governance, insights, prompts, models, audit
- Developer tools (dev-ai, patches, audit)
- PWA offline mode
- Command palette (Ctrl+K)
- PDF invoice generation
- Barcode/QR scanner
