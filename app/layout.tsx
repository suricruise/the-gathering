import type { Metadata, Viewport } from "next";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "../src/styles/tokens.css";
import "../src/styles.css";
import "../src/styles/premium-shell.css";
import "../src/styles/premium-discovery.css";
import { PwaProvider } from "@/src/components/pwa/PwaProvider";
export const metadata: Metadata = {
  title: {
    default: "The Gathering — Find your people",
    template: "%s · The Gathering",
  },
  description:
    "A welcoming 18+ home for gamers to find friendship, grow in faith, and do life together.",
  applicationName: "The Gathering",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true, title: "The Gathering", statusBarStyle: "black",
    startupImage: [
      { url: "/icons/launch-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/launch-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/launch-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/launch-1536x2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  icons: { icon: "/favicon.svg", apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  referrer: "same-origin",
};
export const viewport: Viewport = { themeColor: "#0b0e18", colorScheme: "dark", width: "device-width", initialScale: 1 };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
