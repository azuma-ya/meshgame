import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "03_pusher_signaling",
  description: "Pusher Signaling + P2P Transport Demo",
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
