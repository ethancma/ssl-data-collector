import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
    {
      name: "ssl-runtime-only-secrets",
      enforce: "post",
      generateBundle(_, bundle) {
        // Cloudflare snapshots build-time dev secrets; use runtime bindings instead.
        delete bundle[".dev.vars"];
      },
    },
  ],
});
