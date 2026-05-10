import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vite and Vitest configuration for the React demo and UI tests.
 */
export default defineConfig({
    plugins: [react()],
    build: {
        assetsInlineLimit: 0
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/setupTests.ts"]
    }
});
