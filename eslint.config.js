import tseslint from "typescript-eslint";

/**
 * Architectural boundaries are enforced here, not by convention.
 *
 * Constraint 1 (see docs/ARCHITECTURE.md §1): the simulation must never depend on the
 * renderer. That is what keeps it deterministic, unit-testable, and portable to an
 * authoritative server later. A boundary that is only documented gets violated; a
 * boundary that fails the build does not.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "public/**", "*.config.js"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "three",
              message:
                "src/sim/ must not import three. The simulation is pure data (ARCHITECTURE §1, constraint 1). Move rendering concerns to src/render/.",
            },
          ],
          patterns: [
            {
              group: ["three/*", "three/**"],
              message:
                "src/sim/ must not import three. The simulation is pure data (ARCHITECTURE §1, constraint 1).",
            },
            {
              group: ["**/render/**", "**/ui/**", "**/game/**"],
              message:
                "src/sim/ must not depend on render, ui or game. Dependencies point inward only: game -> sim, render -> sim.",
            },
          ],
        },
      ],
    },
  },
);
