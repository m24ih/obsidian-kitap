import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
    rules: {
      // UI strings Turkish in our plugin, sentence-case English rule not applicable to Turkish phrases
      "obsidianmd/ui/sentence-case": "off",
    },
  },
]);
