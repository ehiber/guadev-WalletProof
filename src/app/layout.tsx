import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/components/session/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blinka Guard",
  description: "Sandbox de cuentas por pagar de NovaLatam Holdings LLC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
