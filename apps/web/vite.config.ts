import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on its own port; the proxy gives the browser one origin, so no CORS.
// API_URL points the proxy at another API, e.g. a second one on a scratch database.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" } },
});
