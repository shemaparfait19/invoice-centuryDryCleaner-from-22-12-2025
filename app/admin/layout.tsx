"use client";

import type { Metadata } from "next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BarChart3, ListOrdered, Shield, Users } from "lucide-react";

// Note: metadata cannot be exported from a client component. If needed,
// define it from a server layout above this or in app/admin/metadata.ts.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [granted, setGranted] = useState<boolean>(false);
  const pathname = usePathname();

  useEffect(() => {
    const readFlag = () => {
      try {
        const ok = localStorage.getItem("ims_admin_granted") === "true";
        setGranted(ok);
      } catch {}
    };
    readFlag();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ims_admin_granted") readFlag();
    };
    const onCustom = () => readFlag();
    window.addEventListener("storage", onStorage);
    window.addEventListener("ims_admin_granted", onCustom as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ims_admin_granted", onCustom as any);
    };
  }, []);
  return (
    <SidebarProvider>
      <Sidebar className="bg-white">
        <SidebarHeader>
          <div className="px-2 py-1 flex items-center justify-between">
            <div className="font-bold">Admin</div>
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/admin" passHref legacyBehavior>
                  <SidebarMenuButton asChild>
                    <a>
                      <Shield className="mr-2" /> Overview
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link
                  href={granted ? "/admin/reports" : "/admin"}
                  passHref
                  legacyBehavior
                >
                  <SidebarMenuButton asChild>
                    <a>
                      <BarChart3 className="mr-2" /> Reports
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link
                  href={granted ? "/admin/activity" : "/admin"}
                  passHref
                  legacyBehavior
                >
                  <SidebarMenuButton asChild>
                    <a>
                      <ListOrdered className="mr-2" /> Activity
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link
                  href={granted ? "/admin/users" : "/admin"}
                  passHref
                  legacyBehavior
                >
                  <SidebarMenuButton asChild>
                    <a>
                      <Users className="mr-2" /> Users
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2">
            <Link href="/">
              <Button variant="outline" className="w-full">
                Back to App
              </Button>
            </Link>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {/* Mobile top bar with menu trigger */}
        <div className="md:hidden sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
          <div className="flex items-center justify-between px-3 py-2">
            <SidebarTrigger />
            <div className="font-semibold">Admin</div>
            <Link href="/" className="text-sm underline">
              Back
            </Link>
          </div>
        </div>

        {/* Page content */}
        <div className="pb-16">{children}</div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="grid grid-cols-4 gap-1 p-2 text-xs">
            <Link
              href={granted ? "/admin" : "/admin"}
              className={`flex flex-col items-center justify-center py-2 rounded ${
                pathname === "/admin" ? "bg-accent" : ""
              }`}
            >
              <Shield className="h-5 w-5" />
              <span>Overview</span>
            </Link>
            <Link
              href={granted ? "/admin/reports" : "/admin"}
              className={`flex flex-col items-center justify-center py-2 rounded ${
                pathname?.startsWith("/admin/reports") ? "bg-accent" : ""
              }`}
            >
              <BarChart3 className="h-5 w-5" />
              <span>Reports</span>
            </Link>
            <Link
              href={granted ? "/admin/activity" : "/admin"}
              className={`flex flex-col items-center justify-center py-2 rounded ${
                pathname?.startsWith("/admin/activity") ? "bg-accent" : ""
              }`}
            >
              <ListOrdered className="h-5 w-5" />
              <span>Activity</span>
            </Link>
            <Link
              href={granted ? "/admin/users" : "/admin"}
              className={`flex flex-col items-center justify-center py-2 rounded ${
                pathname?.startsWith("/admin/users") ? "bg-accent" : ""
              }`}
            >
              <Users className="h-5 w-5" />
              <span>Users</span>
            </Link>
          </div>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
