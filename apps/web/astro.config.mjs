import { defineConfig } from "astro/config";

export default defineConfig({
  redirects: {
    // The confessions list and its search moved onto the home page. Kept so
    // older bookmarks and shared links still land somewhere.
    "/confessions": "/",
  },
});
