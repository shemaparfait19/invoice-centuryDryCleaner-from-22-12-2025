"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  FileText,
  Users,
  TrendingUp,
  Download,
  Database,
  Bell,
} from "lucide-react";
import { InvoiceForm } from "@/components/invoice-form";
import { InvoiceList } from "@/components/invoice-list";
import { ClientManagement } from "@/components/client-management";
import { DailyReport } from "@/components/daily-report";
import { LoadingSpinner } from "@/components/loading-spinner";
import { DatabaseSetup } from "@/components/database-setup";
import { PickupNotifications } from "@/components/pickup-notifications";
import { useSupabaseStore } from "@/lib/supabase-store";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { RealTimeStatusIndicator } from "@/components/real-time-status-indicator";
import { InvoiceDashboardCard } from "@/components/invoice-dashboard-card";
import { InvoiceStatusManager } from "@/components/invoice-status-manager";
import { InvoicePrint } from "@/components/invoice-print";
import { Invoice } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon } from "lucide-react";
import { AdvancedReports } from "@/components/advanced-reports";

type View =
  | "dashboard"
  | "create-invoice"
  | "invoices"
  | "clients"
  | "reports"
  | "setup";

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const {
    invoices,
    clients,
    initializeDatabase,
    loading,
    error,
    isInitialized,
    databaseReady,
    getPickupNotifications,
    currentUserPhone,
    currentUserName,
    setCurrentUser,
    signOut,
  } = useSupabaseStore();
  const [phoneInput, setPhoneInput] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Refresh data every 5 minutes to check for new pickups
  useEffect(() => {
    if (databaseReady && isInitialized) {
      const interval = setInterval(() => {
        // Silently refresh data for notifications
        initializeDatabase();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [databaseReady, isInitialized, initializeDatabase]);

  useEffect(() => {
    return () => {
      // Cleanup real-time subscriptions on unmount
      const { unsubscribeFromRealTimeUpdates } = useSupabaseStore.getState();
      unsubscribeFromRealTimeUpdates();
    };
  }, []);

  const todayInvoices = invoices.filter((invoice) => {
    const today = new Date().toDateString();
    return new Date(invoice.createdAt).toDateString() === today;
  });

  const totalToday = todayInvoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0
  );
  const completedToday = todayInvoices.filter(
    (inv) => inv.status === "completed"
  ).length;
  const pickupNotifications = getPickupNotifications();

  const handleEditInvoice = (invoiceId: string) => {
    setEditingInvoice(invoiceId);
    setCurrentView("create-invoice");
  };

  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setCurrentView("create-invoice");
  };

  // Show database setup if not ready
  if (!databaseReady && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h1 className="text-xl font-bold">Century Dry Cleaner</h1>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => initializeDatabase()}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Retry Connection
                </Button>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          <DatabaseSetup />
        </main>
      </div>
    );
  }

  // Show loading spinner on initial load
  if (loading && !isInitialized) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Century Dry Cleaner</h1>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          <LoadingSpinner />
          <p className="text-center text-muted-foreground mt-4">
            Connecting to database...
          </p>
        </main>
      </div>
    );
  }

  // Simple phone gate for non-admin app
  if (!currentUserPhone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Enter Your Phone Number</CardTitle>
            <CardDescription>
              Use the phone number assigned by admin to access the system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Enter your code"
              type={isPasswordVisible ? "text" : "password"}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setIsPasswordVisible((v) => !v)}
                className="underline"
              >
                {isPasswordVisible ? "Hide" : "Show"}
              </button>
              <span>Use your phone number as code</span>
            </div>
            <Button
              className="w-full"
              onClick={() => setCurrentUser(phoneInput)}
              disabled={!phoneInput}
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case "setup":
        return <DatabaseSetup />;
      case "create-invoice":
        return (
          <InvoiceForm
            editingId={editingInvoice}
            onSave={() => {
              setCurrentView("invoices");
              setEditingInvoice(null);
            }}
            onCancel={() => {
              setCurrentView("dashboard");
              setEditingInvoice(null);
            }}
          />
        );
      case "invoices":
        return <InvoiceList onEdit={handleEditInvoice} />;
      case "clients":
        return <ClientManagement />;
      case "reports":
        return <AdvancedReports />;
      default:
        return (
          <div className="space-y-4 sm:space-y-6 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h1 className="text-2xl sm:text-3xl font-bold">
                Century Dry Cleaner Dashboard
              </h1>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                {pickupNotifications.length > 0 && (
                  <div className="flex items-center gap-1 text-orange-600 bg-orange-100 px-3 py-1 rounded-full text-sm">
                    <Bell className="h-4 w-4" />
                    {pickupNotifications.length} pickup
                    {pickupNotifications.length > 1 ? "s" : ""} due
                  </div>
                )}
                <Button
                  onClick={handleNewInvoice}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  New Invoice
                </Button>
              </div>
            </div>

            {/* Database Connection Status */}
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">
                      Connected to Supabase - Your data is safely stored in the
                      cloud
                    </span>
                    {pickupNotifications.length > 0 && (
                      <span className="text-orange-700 bg-orange-200 px-2 py-1 rounded text-xs">
                        Pickup notifications active
                      </span>
                    )}
                  </div>
                  <RealTimeStatusIndicator />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Today's Revenue
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">
                    {formatCurrency(totalToday)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {todayInvoices.length} invoices today
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Invoices
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{invoices.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {completedToday} completed today
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Clients
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Active clients
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pending Pickups
                  </CardTitle>
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {pickupNotifications.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Due today</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Invoices</CardTitle>
                  <CardDescription>
                    Latest invoices with real-time status updates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {invoices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {invoices.slice(0, 6).map((invoice) => (
                        <InvoiceDashboardCard
                          key={invoice.id}
                          invoice={invoice}
                          onView={setViewInvoice}
                          onEdit={handleEditInvoice}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No invoices yet. Create your first invoice!
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common tasks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={handleNewInvoice}
                    className="w-full justify-start"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Invoice
                  </Button>
                  <Button
                    onClick={() => setCurrentView("clients")}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Manage Clients
                  </Button>
                  <Button
                    onClick={() => setCurrentView("reports")}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    View Reports
                  </Button>
                  <Button
                    onClick={() => setCurrentView("invoices")}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    All Invoices
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Pickup Notifications - Fixed position overlay */}
      <PickupNotifications />

      <nav className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h1 className="text-xl font-bold">Century Dry Cleaner</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={currentView === "dashboard" ? "default" : "ghost"}
                onClick={() => setCurrentView("dashboard")}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Dashboard
                {pickupNotifications.length > 0 && (
                  <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                    {pickupNotifications.length}
                  </span>
                )}
              </Button>
              <Button
                variant={currentView === "invoices" ? "default" : "ghost"}
                onClick={() => setCurrentView("invoices")}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Invoices
              </Button>
              <Button
                variant={currentView === "clients" ? "default" : "ghost"}
                onClick={() => setCurrentView("clients")}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Clients
              </Button>
              <Button
                variant={currentView === "reports" ? "default" : "ghost"}
                onClick={() => setCurrentView("reports")}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Reports
              </Button>
              <Button
                variant={currentView === "setup" ? "default" : "ghost"}
                onClick={() => setCurrentView("setup")}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Setup
              </Button>
              {currentUserPhone && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      <UserIcon className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">
                        {currentUserName || currentUserPhone}
                      </span>
                      <span className="sm:hidden">Account</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => signOut()}>
                      <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-4 sm:py-8">{renderContent()}</main>
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Invoice Details & Status
              </h2>
              <Button variant="ghost" onClick={() => setViewInvoice(null)}>
                ×
              </Button>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>{viewInvoice && <InvoicePrint invoice={viewInvoice} />}</div>
              <div>
                {viewInvoice && (
                  <InvoiceStatusManager
                    invoice={viewInvoice}
                    showDetails={true}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
