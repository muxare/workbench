import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Subagent worktrees under .claude/worktrees/ are separate checkouts with their own
  // tsconfig files; linting them from the main checkout confuses the TS parser.
  { ignores: ["**/dist/**", "**/node_modules/**", "docs/**", ".claude/worktrees/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
);
