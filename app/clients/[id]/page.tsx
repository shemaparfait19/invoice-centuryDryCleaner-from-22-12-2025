"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  ShoppingBag,
  Award,
  TrendingUp,
  Tag,
  Clock,
} from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, AlertTriangle, Clock as ClockIcon, Calendar as CalendarIcon } from "lucide-react";

export default function ClientDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState("all");

  useEffect(() => {
    const fetchClientData = async () => {
      console.log("Fetching client data for ID:", id);
      setLoading(true);
      
      const timer = setTimeout(() => {
         console.warn("Fetch timeout reached");
         setLoading(false);
      }, 5000);

      try {
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("*")
          .eq("id", id)
          .single();

        if (clientError) throw clientError;
        setClient(clientData);

        const { data: invoicesData, error: invoicesError } = await supabase
          .from("invoices")
          .select(`
            *,
            invoice_items (*)
          `)
          .eq("client_id", id)
          .order("created_at", { ascending: false });

        if (invoicesError) throw invoicesError;
        setInvoices(invoicesData || []);
      } catch (error) {
        console.error("Error fetching client data:", error);
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    };

    if (id) {
      fetchClientData();
    } else {
      setLoading(false);
    }
  }, [id]);

  // Filter Invoices based on Time Range
  const filteredInvoices = useMemo(() => {
    if (timeRange === "all") return invoices;
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
      case "7d": cutoff.setDate(now.getDate() - 7); break;
      case "30d": cutoff.setDate(now.getDate() - 30); break;
      case "90d": cutoff.setDate(now.getDate() - 90); break;
      case "6m": cutoff.setMonth(now.getMonth() - 6); break;
      case "1y": cutoff.setFullYear(now.getFullYear() - 1); break;
      default: return invoices;
    }

    return invoices.filter(inv => new Date(inv.created_at) >= cutoff);
  }, [invoices, timeRange]);

  // Analytics Calculations (using filtered data)
  const stats = useMemo(() => {
    if (!filteredInvoices.length && timeRange !== "all") return null; // Show empty state if filtered result is empty
    const dataToUse = filteredInvoices;
    const allHistory = invoices; // For "Lifetime" stats used in AI insights

    const totalSpent = dataToUse.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalVisits = dataToUse.length;
    const avgSpend = totalVisits ? totalSpent / totalVisits : 0;
    
    // Recent Context Stats (Always based on "Now")
    const now = new Date();
    const visitsThisMonth = allHistory.filter(inv => {
      const d = new Date(inv.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    
    const visitsThisYear = allHistory.filter(inv => {
      const d = new Date(inv.created_at);
      return d.getFullYear() === now.getFullYear();
    }).length;
    
    // Dynamic Chart Data
    let chartData = [];
    if (timeRange === "7d" || timeRange === "30d") {
      // Daily breakdown
      const dailyData = dataToUse.reduce((acc, inv) => {
        const date = new Date(inv.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        acc[date] = (acc[date] || 0) + inv.total;
        return acc;
      }, {} as Record<string, number>);
       chartData = Object.entries(dailyData)
        .map(([name, value]) => ({ name, value }))
        .slice(0, 14) // Limit bars
        .reverse();
    } else {
      // Monthly breakdown
      const monthlyData = dataToUse.reduce((acc, inv) => {
        const date = new Date(inv.created_at);
        const monthKey = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
        if (!acc[monthKey]) acc[monthKey] = 0;
        acc[monthKey] += inv.total;
        return acc;
      }, {} as Record<string, number>);
       chartData = Object.entries(monthlyData)
        .map(([name, value]) => ({ name, value }))
        .slice(0, 12)
        .reverse();
    }

    // AI Insights / Habit Analysis (Uses FULL history for accuracy)
    const habitAnalysis = (() => {
      if (allHistory.length < 3) return null;

      // 1. Favorite Day
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayCounts = new Array(7).fill(0);
      
      // 2. Favorite Time (Morning/Afternoon)
      let morning = 0, afternoon = 0, evening = 0;

      allHistory.forEach(inv => {
        const d = new Date(inv.created_at);
        dayCounts[d.getDay()]++;
        const h = d.getHours();
        if (h < 12) morning++;
        else if (h < 17) afternoon++;
        else evening++;
      });

      const favDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
      const favDay = days[favDayIndex];
      
      const timeOfDay = morning > afternoon && morning > evening ? 'Morning' :
                        afternoon > morning && afternoon > evening ? 'Afternoon' : 'Evening';

      // 3. Churn Risk
      // Sort history ascending
      const sortedHistory = [...allHistory].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastVisit = new Date(sortedHistory[sortedHistory.length - 1].created_at);
      const daysSinceLast = Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
      
      // Avg interval
      let totalInterval = 0;
      for(let i=1; i<sortedHistory.length; i++) {
         totalInterval += (new Date(sortedHistory[i].created_at).getTime() - new Date(sortedHistory[i-1].created_at).getTime());
      }
      const avgIntervalDays = Math.floor((totalInterval / (sortedHistory.length - 1)) / (1000 * 60 * 60 * 24));
      
      const isChurnRisk = daysSinceLast > (avgIntervalDays * 2.5) && daysSinceLast > 30;

      // 4. Persona
      let persona = "Regular Customer";
      const itemNames = allHistory.flatMap(i => i.invoice_items?.map((it:any) => it.description.toLowerCase()) || []);
      const suitsCount = itemNames.filter(n => n.includes('suit')).length;
      const shirtsCount = itemNames.filter(n => n.includes('shirt')).length;
      
      if (suitsCount > allHistory.length) persona = "The Professional 👔"; // More suits than visits
      else if (isChurnRisk) persona = "At-Risk Customer ⚠️";
      else if (allHistory.length > 20) persona = "Loyalist 🌟";
      else if (avgSpend > 50000) persona = "Big Spender 💎";

      return { favDay, timeOfDay, daysSinceLast, avgIntervalDays, isChurnRisk, persona };
    })();

    // Item Analysis (Filtered)
    const itemCounts: Record<string, number> = {};
    dataToUse.forEach(inv => {
      inv.invoice_items.forEach((item: any) => {
        const name = item.description;
        itemCounts[name] = (itemCounts[name] || 0) + item.quantity;
      });
    });
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    return { 
      totalSpent, 
      totalVisits, 
      visitsThisMonth, 
      visitsThisYear, 
      avgSpend, 
      chartData, 
      topItems,
      habit: habitAnalysis 
    };
  }, [invoices, filteredInvoices, timeRange]);

  // Updated Promotion Engine
  const promotions = useMemo(() => {
    if (!stats || !client) return [];

    const suggestions = [];

    // Churn Prevention Offer
    if (stats.habit?.isChurnRisk) {
       suggestions.push({
        type: "churn",
        title: "⚠️ We Miss You Offer",
        description: `Customer hasn't visited in ${stats.habit.daysSinceLast} days (usually visits every ${stats.habit.avgIntervalDays} days).`,
        action: "Send '20% Off Next Visit' SMS",
        priority: "high"
      });
    }

    // ... (Keep existing promotions)
    const visits = stats.visitsThisYear; // Using yearly for simplicity here, or use lifetime from store if available
    const lifetimeVisits = invoices.length;
    
    if (lifetimeVisits % 10 === 0 && lifetimeVisits > 0) {
      suggestions.push({
        type: "milestone",
        title: "🎉 10th Visit Milestone!",
        description: "Customer has hit a 10-visit milestone.",
        action: "Apply 15% Off",
        priority: "high"
      });
    }

    const hasManySuits = stats.topItems.some(i => i.name.toLowerCase().includes('suit') && i.value > 3);
    if (hasManySuits) {
      suggestions.push({
        type: "item",
        title: "👔 Suit Deal",
        description: "Frequent suit customer.",
        action: "Offer '3 Suits for 2'",
        priority: "medium"
      });
    }

    return suggestions;
  }, [stats, client, invoices]);

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;
  if (!client) return <div className="p-8">Client not found</div>;

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {client.name}
              {stats?.habit?.persona && <Badge variant="secondary" className="ml-2 font-normal"><Sparkles className="w-3 h-3 mr-1" />{stats.habit.persona}</Badge>}
            </h1>
            <p className="text-muted-foreground text-sm">
             {client.phone} • {client.address || "No address"}
            </p>
          </div>
        </div>
        
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 3 Months</SelectItem>
            <SelectItem value="6m">Last 6 Months</SelectItem>
            <SelectItem value="1y">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {stats?.habit && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
          <CardHeader className="pb-2">
             <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
                Customer Insights
             </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-full shadow-sm">
                     <CalendarIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Favorite Day</p>
                    <p className="font-semibold text-blue-900">{stats.habit.favDay}s</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-full shadow-sm">
                     <ClockIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Preferred Time</p>
                    <p className="font-semibold text-blue-900">{stats.habit.timeOfDay}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-full shadow-sm">
                     <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Avg Visit Interval</p>
                    <p className="font-semibold text-blue-900">Every {stats.habit.avgIntervalDays} days</p>
                  </div>
               </div>
            </div>
            {stats.habit.isChurnRisk && (
               <div className="mt-4 flex items-center gap-2 text-amber-700 bg-amber-100/50 p-2 rounded text-xs border border-amber-200">
                  <AlertTriangle className="w-4 h-4" />
                  <strong>Churn Alert:</strong> Customer is overdue for a visit (Last visit: {stats.habit.daysSinceLast} days ago).
               </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Key Stats Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Period Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalSpent || 0)}</div>
            <p className="text-xs text-muted-foreground">{timeRange === 'all' ? 'Lifetime' : 'In Selected Period'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Visits</CardTitle>
            <ShoppingBag className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalVisits || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.visitsThisMonth} this month • {stats?.visitsThisYear} this year
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average Ticket</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.avgSpend || 0)}</div>
            <p className="text-xs text-muted-foreground">per visit</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Analytics & Trends</TabsTrigger>
          <TabsTrigger value="insights">Promotions & Insights</TabsTrigger>
          <TabsTrigger value="history">Invoice History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Spending History</CardTitle>
                <CardDescription>Monthly spending over time</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.chartData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value/1000}k`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Items</CardTitle>
                <CardDescription>Most frequently brought items</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.topItems || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {(stats?.topItems || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {promotions.map((promo, idx) => (
              <Card key={idx} className={promo.priority === 'high' ? 'border-primary bg-primary/5' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {promo.title}
                    </CardTitle>
                    {promo.priority === 'high' && <Badge>Recommended</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{promo.description}</p>
                  <div className="bg-white p-3 rounded-lg border border-dashed border-gray-300">
                    <p className="font-semibold text-sm text-center text-primary">{promo.action}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
             <CardHeader>
                <CardTitle>Detailed Item Analysis</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="space-y-2">
                   {stats?.topItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded">
                         <span className="font-medium">{item.name}</span>
                         <Badge variant="outline">{item.value} times</Badge>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm">{inv.id}</p>
                        <Badge variant={inv.status === 'completed' ? 'default' : 'secondary'}>{inv.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()} at {new Date(inv.created_at).toLocaleTimeString()}</p>
                      <p className="text-xs text-muted-foreground">{inv.invoice_items?.length || 0} items</p>
                    </div>
                    <div className="mt-2 sm:mt-0 text-right">
                      <p className="font-bold">{formatCurrency(inv.total)}</p>
                      <p className="text-xs text-muted-foreground">{inv.payment_method}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
