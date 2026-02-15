import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RWTW Post Your Wins",
  description: "Showcase your wins with the RWTW community",
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
