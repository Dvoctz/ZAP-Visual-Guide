import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  modules: ["workflow/nitro"],
  preset: "vercel",
  vercel: { entryFormat: "node" },
  routes: {
    "/**": { handler: "./api/index.ts", format: "node" },
  },
  publicAssets: [
    {
      dir: "dist",
      maxAge: 3600,
    },
  ],
});

