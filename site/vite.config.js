import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/; override with BASE=/ locally.
export default defineConfig({
  base: process.env.BASE ?? "/jacobs-city-lens/",
});
