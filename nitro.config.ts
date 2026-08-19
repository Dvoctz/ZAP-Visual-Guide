import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  modules: ["workflow/nitro"],
  preset: "vercel",
  vercel: { entryFormat: "node" },
  routes: {
    "/**": { handler: "./server/app.ts", format: "node" },
  },
  publicAssets: [
    {
      dir: "dist",
      maxAge: 3600,
    },
  ],
});

