"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemCatalogManager } from "@/components/item-catalog-manager";

export default function ItemsPage() {
  return (
    <div>
      <div className="container mx-auto px-4 pt-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
      <ItemCatalogManager />
    </div>
  );
}
