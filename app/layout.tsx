import type { Metadata } from "next";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "../src/styles.css";
export const metadata: Metadata = {
  title: {
    default: "The Gathering — Find your people",
    template: "%s · The Gathering",
  },
  description:
    "A welcoming 18+ home for gamers to find friendship, grow in faith, and do life together.",
  icons: { icon: "/favicon.svg" },
  referrer: "same-origin",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
