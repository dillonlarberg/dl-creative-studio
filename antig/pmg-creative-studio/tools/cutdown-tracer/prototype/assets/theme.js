/* Tailwind Play CDN config — mirrors the Alli Design System theme from
 * src/index.css so the prototype uses the EXACT same palette/utilities as the
 * real app. Load AFTER <script src="https://cdn.tailwindcss.com"></script>.
 * Reference: src/index.css @theme block. */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        blue: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
          400: "#60a5fa", 500: "#3b82f6", 600: "#0C69EA", 700: "#0b5ed4",
          800: "#0a4fb3", 900: "#083d8a",
        },
        "blue-gray": {
          25: "#F9FBFE", 50: "#F4F7FC", 100: "#EEF1F7", 150: "#E5E8EE",
          200: "#CCD2DD", 300: "#ACB4C4", 400: "#8F97AA", 500: "#6F768B",
          600: "#5A6076", 700: "#42485C", 750: "#383D50", 800: "#2D3142",
          900: "#1F2430", 1000: "#13151b",
        },
        // Ask Alli purple accent — indigo→violet. Drives the prompt step and
        // the generating sparkle animation (see assets/alli.css). Mirrors the
        // indigo/violet used by SingleImageModal.tsx in the real app.
        indigo: {
          50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc",
          400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca",
          800: "#3730a3", 900: "#312e81",
        },
        violet: {
          50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd",
          400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9",
          800: "#5b21b6", 900: "#4c1d95",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        elevated: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      },
    },
  },
};
