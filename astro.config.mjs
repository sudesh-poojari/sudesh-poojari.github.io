import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sudesh.co.in",
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: "github-dark"
    }
  }
});
