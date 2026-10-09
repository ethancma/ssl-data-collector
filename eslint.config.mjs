import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message: "Use createClient from lib/supabase/client.ts or lib/supabase/server.ts.",
            },
            {
              name: "@supabase/ssr",
              message: "Use createClient from lib/supabase/client.ts or lib/supabase/server.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.property.name='env'][property.name='SUPABASE_SECRET_KEY']",
          message: "SUPABASE_SECRET_KEY is server-only.",
        },
      ],
    },
  },
];

export default eslintConfig;
