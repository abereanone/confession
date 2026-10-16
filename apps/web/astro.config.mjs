import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // Required for the sitemap: without an absolute `site` there is no origin to
  // build <loc> values from, and @astrojs/sitemap emits nothing at all.
  site: "https://confess.catechize.ing",
  // Astro 7 defaults to "jsx", which drops the line break between text and an inline
  // tag ("enjoy<a>x</a>and" renders as "enjoyxand"). true keeps the Astro 6 behaviour.
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        // Search indexes and the offline manifest are data endpoints, not pages.
        if (pathname.endsWith(".json")) return false;
        // Declared below as a redirect to the home page.
        if (pathname === "/confessions/" || pathname === "/confessions") return false;
        return true;
      },
    }),
  ],
  redirects: {
    // The confessions list and its search moved onto the home page. Kept so
    // older bookmarks and shared links still land somewhere.
    "/confessions": "/",
  },
});
