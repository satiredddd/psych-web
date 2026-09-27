import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // No custom "base" needed — Netlify serves the site from the domain root,
  // unlike GitHub Pages project sites which live under a /repo-name/ subpath.
});
