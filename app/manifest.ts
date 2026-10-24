import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "The Gathering", short_name: "Gathering",
    description: "Your people. Your place. An 18+ community for games, friendship and faith.",
    start_url: "/home", scope: "/", display: "standalone", lang: "en",
    background_color: "#0b0e18", theme_color: "#0b0e18",
    categories: ["games", "social", "lifestyle"], prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Home", url: "/home", description: "Your communities and gatherings" },
      { name: "Messages", url: "/messages", description: "Your friends and conversations" },
      { name: "Voice lounge", url: "/voice", description: "Browse voice rooms" },
    ],
    screenshots: [
      { src: "/screenshots/desktop.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "The Gathering desktop welcome" },
      { src: "/screenshots/mobile.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "The Gathering mobile welcome" },
    ],
  };
}
