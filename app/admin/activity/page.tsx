"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export default function AdminActivity() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows(data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Activity Log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Actions</CardTitle>
          <CardDescription>Who changed what and when</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            "Loading..."
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Time</th>
                    <th className="p-2">Actor</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Entity</th>
                    <th className="p-2">ID</th>
                    <th className="p-2">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {r.actor_name || r.actor_phone || "Unknown"}
                      </td>
                      <td className="p-2">{r.action}</td>
                      <td className="p-2">{r.entity_type}</td>
                      <td className="p-2">{r.entity_id}</td>
                      <td className="p-2 max-w-[400px] truncate">
                        {r.changes ? JSON.stringify(r.changes) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
