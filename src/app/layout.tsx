import type { Metadata } from "next";
import "./globals.css";
import AccessibilityProvider from "@/components/AccessibilityProvider";

export const metadata: Metadata = {
  title: "Interview Coach — AI-Powered Mock Interviews",
  description: "Practice interviews with AI. Get structured STAR feedback, track weak spots, and improve over time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AccessibilityProvider>{children}</AccessibilityProvider>
      </body>
    </html>
  );
}
