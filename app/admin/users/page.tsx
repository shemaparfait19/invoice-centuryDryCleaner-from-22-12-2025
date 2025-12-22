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
import { supabase } from "@/lib/supabase";

export default function AdminUsers() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    if (!name || !phone) return;
    await supabase.from("users").insert({ name, phone, role: "user" });
    setName("");
    setPhone("");
    await load();
  };

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create User Account</CardTitle>
          <CardDescription>
            Enter user name and phone number. Users will log in with phone only.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Phone (+250...)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button onClick={createUser} disabled={!name || !phone}>
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            "Loading..."
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Name</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="p-2">{u.name}</td>
                      <td className="p-2">{u.phone}</td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">
                        {new Date(u.created_at).toLocaleString()}
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
