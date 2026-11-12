"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DailyCashReport } from "@/components/daily-cash-report";

export default function DailyReportPage() {
  return (
    <div>
      <div className="no-print container mx-auto px-4 pt-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
      <DailyCashReport />
    </div>
  );
}
