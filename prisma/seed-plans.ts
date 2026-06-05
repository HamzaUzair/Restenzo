/**
 * Seeds the `plans` table from the marketing defaults in `lib/pricing.ts`.
 *
 * Idempotent: upserts by slug so it is safe to re-run. Existing edits to a
 * plan's price/features made in the Platform Admin are preserved (we only
 * `create` missing plans and never overwrite an existing row's editable
 * fields). Run with: `npm run seed:plans`.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PLANS } from "../lib/pricing";

const prisma = new PrismaClient();

const DEFAULT_MAX_BRANCHES: Record<string, number | null> = {
  single: 1,
  multi: 10,
  enterprise: null,
};

async function main() {
  console.log("🌱 Seeding subscription plans...");

  for (let i = 0; i < PLANS.length; i++) {
    const p = PLANS[i];
    const maxBranches = DEFAULT_MAX_BRANCHES[p.id] ?? null;

    const existing = await prisma.plan.findUnique({ where: { slug: p.id } });
    if (existing) {
      console.log(`  ↳ ${p.id} already exists — leaving editable fields intact`);
      continue;
    }

    await prisma.plan.create({
      data: {
        slug: p.id,
        name: p.name,
        description: p.tagline,
        monthly_price: new Prisma.Decimal(p.monthly),
        yearly_price: new Prisma.Decimal(p.yearly),
        currency: p.currency,
        billing_label: "/mo",
        cta_label: p.cta,
        is_active: true,
        is_popular: Boolean(p.highlighted),
        is_custom: p.id === "enterprise",
        max_branches: maxBranches,
        sort_order: i,
        features: [...p.features],
        stripe_monthly_price_id: p.stripeIds?.monthly ?? null,
        stripe_yearly_price_id: p.stripeIds?.yearly ?? null,
      },
    });
    console.log(`  ✓ created ${p.id} (max_branches=${maxBranches ?? "unlimited"})`);
  }

  console.log("✅ Plan seeding complete.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding plans:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
