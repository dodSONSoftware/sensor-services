import ts from "@typescript-eslint/parser";
import plugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["node_modules/", "dist/", "jest.config.ts", "jest.setup.ts", "tests/", "src/dodsonlabs/"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: ts,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": plugin,
    },
    rules: {
      // eslint:recommended (individual rules for flat config)
      "no-unused-vars": "off",
      "no-console": "warn",
      "no-const-assign": "warn",
      "no-dupe-args": "warn",
      "no-dupe-keys": "warn",
      "no-unreachable": "warn",
      "no-fallthrough": "warn",
      "no-empty": "warn",
      "no-var": "warn",
      "prefer-const": "warn",
      "no-undef": "off",
      "no-return-assign": "warn",
      "no-useless-catch": "warn",
      "no-duplicate-imports": "warn",
      "no-extra-boolean-cast": "warn",
      "no-sparse-arrays": "warn",
      "no-loss-of-precision": "warn",

      // @typescript-eslint
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",

      // Style rules matching .editorconfig
      semi: ["warn", "always"],
      quotes: ["warn", "double"],
      indent: ["warn", 4],
    },
  },
];
