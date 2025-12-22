"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function AdminGate() {
  const [code, setCode] = useState("");
  const [granted, setGranted] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const ok = localStorage.getItem("ims_admin_granted") === "true";
      setGranted(ok);
    } catch {}
  }, []);
  const PASSCODE = "2004";

  if (!mounted || !granted) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Access</CardTitle>
            <CardDescription>Enter the admin passcode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Passcode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={() => {
                const ok = code === PASSCODE;
                setGranted(ok);
                if (ok) localStorage.setItem("ims_admin_granted", "true");
                // dispatch a custom event to notify layouts to re-read granted state
                try {
                  window.dispatchEvent(new Event("ims_admin_granted"));
                } catch {}
              }}
              disabled={!code}
            >
              Enter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin Portal</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/reports">
          <Card className="hover:bg-accent cursor-pointer">
            <CardHeader>
              <CardTitle>Detailed Reports</CardTitle>
              <CardDescription>View and download analytics.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/activity">
          <Card className="hover:bg-accent cursor-pointer">
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Track edits, deletions and status changes.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/users">
          <Card className="hover:bg-accent cursor-pointer">
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Create and manage user accounts.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
