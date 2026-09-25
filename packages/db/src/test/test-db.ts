// The dedicated database integration tests run against — never the same
// database you're looking at in `pnpm dev`. Kept as one literal, imported
// everywhere it's needed, so there's exactly one place to change it.
//
// NOTE: `package.json`'s `db:test:setup` script has this same URL
// hardcoded (package.json can't import a .ts constant) — keep the two in
// sync if you ever change this.
export const TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/app_test";
