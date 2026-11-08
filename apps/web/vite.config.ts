import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on its own port; the proxy gives the browser one origin, so no CORS.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
});
