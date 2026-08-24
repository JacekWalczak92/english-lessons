import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "J-Learner · English Lessons",
  description: "Wspólny edytor fiszek z lekcji angielskiego",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
