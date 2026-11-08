// drizzle-kit reads this to generate SQL migrations from src/db/schema.ts:
// `pnpm --filter @workbench/api db:generate`. Only `generate` is used; the
// app applies the migrations itself when it opens the database.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
});
