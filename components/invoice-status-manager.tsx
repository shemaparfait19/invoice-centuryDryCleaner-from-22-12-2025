"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

interface InvoiceStatusManagerProps {
  invoice: Invoice;
  showDetails?: boolean;
  compact?: boolean;
}

export function InvoiceStatusManager({
  invoice,
  showDetails = true,
  compact = false,
}: InvoiceStatusManagerProps) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<
    "pending" | "completed" | "cancelled" | null
  >(null);
  const {
    updateInvoiceStatus,
    updateInvoicePaid,
    updateInvoicePaymentMethod,
    loading,
  } = useSupabaseStore();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleStatusChange = (
    status: "pending" | "completed" | "cancelled"
  ) => {
    setNewStatus(status);
    setIsChangingStatus(true);
  };

  const confirmStatusChange = async () => {
    if (newStatus) {
      await updateInvoiceStatus(invoice.id, newStatus);
      setIsChangingStatus(false);
      setNewStatus(null);
    }
  };

  const getStatusChangeMessage = () => {
    switch (newStatus) {
      case "completed":
        return "Mark this invoice as completed? This indicates the service has been finished and delivered.";
      case "pending":
        return "Mark this invoice as pending? This indicates the service is still in progress.";
      case "cancelled":
        return "Mark this invoice as cancelled? This action indicates the service was not completed.";
      default:
        return "Are you sure you want to change the status?";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          className={`${getStatusColor(
            invoice.status
          )} flex items-center gap-1`}
        >
          {getStatusIcon(invoice.status)}
          {invoice.status.toUpperCase()}
        </Badge>

        <Select onValueChange={handleStatusChange} disabled={loading}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="Change..." />
          </SelectTrigger>
          <SelectContent>
            {invoice.status !== "pending" && (
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Pending
                </div>
              </SelectItem>
            )}
            {invoice.status !== "completed" && (
              <SelectItem value="completed">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  Completed
                </div>
              </SelectItem>
            )}
            {invoice.status !== "cancelled" && (
              <SelectItem value="cancelled">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3 w-3" />
                  Cancelled
                </div>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <AlertDialog open={isChangingStatus} onOpenChange={setIsChangingStatus}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                {getStatusChangeMessage()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmStatusChange}>
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Invoice Status</span>
          <Badge
            className={`${getStatusColor(
              invoice.status
            )} flex items-center gap-1`}
          >
            {getStatusIcon(invoice.status)}
            {invoice.status.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showDetails && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Invoice ID:</span>
              <p className="text-muted-foreground">{invoice.id}</p>
            </div>
            <div>
              <span className="font-medium">Client:</span>
              <p className="text-muted-foreground">{invoice.client.name}</p>
            </div>
            <div>
              <span className="font-medium">Total:</span>
              <p className="text-muted-foreground">
                {formatCurrency(invoice.total)}
              </p>
            </div>
            <div>
              <span className="font-medium">Last Updated:</span>
              <p className="text-muted-foreground">
                {new Date(invoice.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium">Change Status:</h4>
          <div className="flex gap-2 flex-wrap">
            {invoice.status !== "pending" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("pending")}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Mark Pending
              </Button>
            )}

            {invoice.status !== "completed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("completed")}
                disabled={loading}
                className="flex items-center gap-2 text-green-700 border-green-300 hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Completed
              </Button>
            )}

            {invoice.status !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("cancelled")}
                disabled={loading}
                className="flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Mark Cancelled
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <h4 className="font-medium">Payment:</h4>
          <div className="flex gap-2 flex-wrap items-center">
            <Badge
              className={
                invoice.paid
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }
            >
              {invoice.paid ? "PAID" : "UNPAID"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateInvoicePaid(invoice.id, !invoice.paid)}
              disabled={loading}
            >
              Mark {invoice.paid ? "Unpaid" : "Paid"}
            </Button>
            <Select
              value={invoice.paymentMethod}
              onValueChange={(value) =>
                updateInvoicePaymentMethod(invoice.id, value)
              }
              disabled={loading}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNPAID">Unpaid / On Account</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="MOMO">Mobile Money</SelectItem>
                <SelectItem value="BANK">Bank Transfer</SelectItem>
                <SelectItem value="CARD">Card Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {invoice.pickupDate && invoice.pickupTime && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>Pickup:</strong> {invoice.pickupDate} at{" "}
                {invoice.pickupTime}
              </span>
            </div>
          </div>
        )}

        <AlertDialog open={isChangingStatus} onOpenChange={setIsChangingStatus}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                {getStatusChangeMessage()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmStatusChange}>
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm Change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
