"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  StickyNote,
} from "lucide-react";
import { InvoiceStatusManager } from "@/components/invoice-status-manager";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

interface InvoiceDashboardCardProps {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onEdit: (invoiceId: string) => void;
}

export function InvoiceDashboardCard({
  invoice,
  onView,
  onEdit,
}: InvoiceDashboardCardProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const isPickupDue = () => {
    if (!invoice.pickupDate || !invoice.pickupTime) return false;

    const now = new Date();
    const pickupDateTime = new Date(
      `${invoice.pickupDate}T${invoice.pickupTime}:00`
    );
    const timeDiff = pickupDateTime.getTime() - now.getTime();
    const minutesDiff = timeDiff / (1000 * 60);

    return minutesDiff <= 30 && minutesDiff >= -60;
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow ${
        isPickupDue() ? "border-orange-200 bg-orange-50" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {invoice.client.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            {getStatusIcon(invoice.status)}
            {isPickupDue() && (
              <Badge className="bg-orange-100 text-orange-800 text-xs">
                Pickup Due
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Floating Notes Display */}
      {invoice.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mx-4 -mt-2 mb-3">
          <div className="flex items-start gap-2">
            <StickyNote className="h-3 w-3 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-800 mb-1">
                Notes & Updates
              </p>
              <p className="text-xs text-blue-700 line-clamp-2">
                {invoice.notes}
              </p>
            </div>
          </div>
        </div>
      )}

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Invoice:</span>
            <p className="font-mono">{invoice.id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total:</span>
            <p className="font-semibold">{formatCurrency(invoice.total)}</p>
          </div>
        </div>

        {invoice.createdByName && (
          <div className="text-xs">
            <span className="text-muted-foreground">Created by:</span>
            <p>{invoice.createdByName}</p>
          </div>
        )}

        {/* Invoice Items Display */}
        {invoice.items && invoice.items.length > 0 && (
          <div className="text-xs">
            <span className="text-muted-foreground">Items ({invoice.items.length}):</span>
            <div className="mt-1 space-y-1">
              {invoice.items.slice(0, 3).map((item, index) => (
                <div key={item.id} className="flex justify-between">
                  <span className="truncate flex-1">{item.description}</span>
                  <span className="ml-2 font-medium">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </span>
                </div>
              ))}
              {invoice.items.length > 3 && (
                <p className="text-muted-foreground italic">
                  +{invoice.items.length - 3} more items
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Debug: Show if no items */}
        {(!invoice.items || invoice.items.length === 0) && (
          <div className="text-xs text-red-500">
            No items found (Debug)
          </div>
        )}

        {invoice.pickupDate && invoice.pickupTime && (
          <div className="text-xs">
            <span className="text-muted-foreground">Pickup:</span>
            <p className={isPickupDue() ? "text-orange-700 font-medium" : ""}>
              {invoice.pickupDate} at {invoice.pickupTime}
            </p>
          </div>
        )}

        <div className="pt-2 border-t">
          <InvoiceStatusManager
            invoice={invoice}
            compact={true}
            showDetails={false}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onView(invoice)}
            className="flex-1 text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(invoice.id)}
            className="flex-1 text-xs"
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
