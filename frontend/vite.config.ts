import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": "http://localhost:3001",
      "/campaigns": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
