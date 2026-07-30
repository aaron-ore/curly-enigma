import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "CodePay Billing",
  description: "CodePay Client Billing System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Navbar />
        <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
