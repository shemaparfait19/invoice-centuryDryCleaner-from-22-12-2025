import type { Metadata, Viewport } from "next"
import { Inter } from 'next/font/google'
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { PwaRegister } from "@/components/pwa-register"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Century Dry Cleaner - Invoice Management",
  description: "Professional invoice management system for Century Dry Cleaner",
  applicationName: "Century Dry Cleaner",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Century",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  generator: 'v0.dev'
}

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  )
}
