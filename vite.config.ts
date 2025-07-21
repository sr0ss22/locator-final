import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react"; // Changed from @vitejs/plugin-react-swc

import path from "path";

export default defineConfig(() => {
  console.log("Vite config is being loaded.");
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [dyadComponentTagger(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      include: ['react-leaflet', 'leaflet'],
    },
    ssr: {
      noExternal: ['react-leaflet', 'leaflet']
    }
  };
});