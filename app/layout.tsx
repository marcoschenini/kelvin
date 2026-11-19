import type { Metadata, Viewport } from "next";
import { EB_Garamond, JetBrains_Mono, Public_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/shell/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Body and UI: Public Sans, a neutral gothic sans (free stand-in for Ringside), with tabular figures.
const sans = Public_Sans({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  display: "swap",
});

// Headings: EB Garamond (free stand-in for ITC Garamond Narrow).
const serif = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kelvin · Pharma claims recovery", template: "%s · Kelvin" },
  description: "From temperature excursion to recovered money. Claims recovery for pharmaceutical cold-chain shipments.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1324" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${jetbrains.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
