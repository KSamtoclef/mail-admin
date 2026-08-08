import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Admin",
  description: "Campaign sending, click tracking, and site analytics dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
