import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "AI Images Template Manager",
  description: "Create, edit, search, and remove image-generation templates against your Gadget app.",
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
