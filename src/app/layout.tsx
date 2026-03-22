import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

export const metadata: Metadata = {
  title: "InterviewCoach — AI-Powered Mock Interviews",
  description: "Practice interviews with AI feedback. Track weak spots and improve over time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#000", minHeight: "100vh" }}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
