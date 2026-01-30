import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

function excludeConfigFromBuild(): Plugin {
  return {
    name: "exclude-config-json",
    closeBundle() {
      const configPath = path.resolve(__dirname, "dist", "config.json");
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    },
  };
}

export default defineConfig({
  base: "/repeatrom/",
  plugins: [react(), tailwindcss(), excludeConfigFromBuild()],
});
