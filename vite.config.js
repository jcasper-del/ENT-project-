import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        navigator: "Michigan_HeadNeck_Navigator.html",
        gallery: "design-gallery.html",
        clinical: "design-option-clinical.html",
        journey: "design-option-journey.html",
        trialDesk: "design-option-trial-desk.html"
      }
    }
  }
});
