/**
 * Default menu categories that are auto-seeded the moment a new branch is
 * created (head-office branch creation, Super Admin restaurant creation,
 * or self-serve onboarding's single-branch tenant).
 *
 * These are *starter* categories only — a Branch Admin can rename, deactivate
 * or permanently delete any of them through the standard Categories UI just
 * like any user-created category. They are never re-seeded after the initial
 * branch creation, so a deleted "Pizza" stays deleted even after refresh /
 * relogin.
 *
 * Order matters for the initial creation pass: each name is created in this
 * order so the categories landing page can rely on insertion order if it ever
 * stops sorting alphabetically. Today the Categories grid sorts by name, so
 * users see the list alphabetized regardless.
 */
export const DEFAULT_BRANCH_CATEGORIES: readonly string[] = [
  "BBQ & Grilled",
  "Burgers & Sandwiches",
  "Chicken Entrées",
  "Cold Beverages",
  "Deals",
  "Deals Specials",
  "Desserts",
  "Hot Beverages",
  "Pizza",
  "Rice & Biryani",
  "Sides",
  "Soft Drinks",
] as const;
