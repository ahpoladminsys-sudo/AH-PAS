/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f4f8f9",
      "foreground": "#12323f",
      "border": "#d5e6e9",
      "card": "#ffffff",
      "cardForeground": "#12323f",
      "popover": "#ffffff",
      "popoverForeground": "#12323f",
      "primary": "#003648",
      "primaryForeground": "#ffffff",
      "secondary": "#e6eef5",
      "secondaryForeground": "#123f4b",
      "muted": "#edf3f5",
      "mutedForeground": "#5c6b78",
      "accent": "#dcf6ec",
      "accentForeground": "#0b5f52",
      "destructive": "#b5352f",
      "destructiveForeground": "#ffffff",
      "input": "#c6d8dc",
      "ring": "#1fa0b3",
      "chart1": "#084c7b",
      "chart2": "#1fa0b3",
      "chart3": "#28d994",
      "chart4": "#d6a449",
      "chart5": "#b5352f",
      "sidebar": "#003648",
      "sidebarForeground": "#e8f7f8",
      "sidebarBorder": "#1b5363",
      "sidebarPrimary": "#1fa0b3",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#0c4557",
      "sidebarAccentForeground": "#e8f7f8",
      "sidebarRing": "#72d6dd"
    },
    "dark": {
      "background": "#0c2029",
      "foreground": "#e8f7f8",
      "border": "#244552",
      "card": "#102b36",
      "cardForeground": "#e8f7f8",
      "popover": "#102b36",
      "popoverForeground": "#e8f7f8",
      "primary": "#55c6d0",
      "primaryForeground": "#08252d",
      "secondary": "#1a3c48",
      "secondaryForeground": "#e8f7f8",
      "muted": "#17333e",
      "mutedForeground": "#a8c1c6",
      "accent": "#174d47",
      "accentForeground": "#a9f2d3",
      "destructive": "#d45a52",
      "destructiveForeground": "#1b0c0b",
      "input": "#2b4d58",
      "ring": "#72d6dd",
      "chart1": "#55a9d5",
      "chart2": "#55c6d0",
      "chart3": "#55d9a1",
      "chart4": "#e1ba63",
      "chart5": "#e4776e",
      "sidebar": "#071b24",
      "sidebarForeground": "#e8f7f8",
      "sidebarBorder": "#244552",
      "sidebarPrimary": "#55c6d0",
      "sidebarPrimaryForeground": "#08252d",
      "sidebarAccent": "#123640",
      "sidebarAccentForeground": "#e8f7f8",
      "sidebarRing": "#72d6dd"
    }
  },
  "fontFamily": {
    "sans": [
      "Urbanist",
      "IBM Plex Sans",
      "sans-serif"
    ],
    "serif": [
      "IBM Plex Serif",
      "Georgia",
      "serif"
    ],
    "mono": [
      "IBM Plex Mono",
      "Menlo",
      "monospace"
    ]
  },
  "radius": "0.5rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
