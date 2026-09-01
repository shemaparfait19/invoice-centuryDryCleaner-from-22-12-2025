"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatPhoneNumber } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ArrowLeft, Merge, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function DuplicateClientsPage() {
  const {
    clients,
    invoices,
    isInitialized,
    loading,
    initializeDatabase,
    findDuplicateClients,
    mergeClients,
  } = useSupabaseStore();
  const [selectedKeep, setSelectedKeep] = useState<Record<string, string>>({});
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  useEffect(() => {
    if (useSupabaseStore.getState().isInitialized) {
      useSupabaseStore.getState().loadData();
    } else {
      initializeDatabase();
    }
  }, [initializeDatabase]);

  const groups = useMemo(() => findDuplicateClients(), [clients, findDuplicateClients]);

  const invoiceCountFor = (clientId: string) =>
    invoices.filter((inv) => inv.client.id === clientId).length;

  const handleMerge = async (key: string, clientIds: string[]) => {
    const keepId = selectedKeep[key] || clientIds[0];
    const mergeIds = clientIds.filter((id) => id !== keepId);
    setMergingKey(key);
    try {
      await mergeClients(keepId, mergeIds);
    } catch {
      // Store already surfaced a toast.
    } finally {
      setMergingKey(null);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Duplicate Clients</h1>
          <p className="text-sm text-muted-foreground">
            Client records that share the same phone number once formatting is
            ignored — likely the same person recorded twice.
          </p>
        </div>
      </div>

      {loading && !isInitialized ? (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Users className="h-8 w-8" />
            No duplicate clients found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const keepId = selectedKeep[group.key] || group.clients[0].id;
            return (
              <Card key={group.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {formatPhoneNumber(group.clients[0].phone)}
                  </CardTitle>
                  <CardDescription>
                    {group.clients.length} records share this number. Pick which
                    one to keep — the rest will be merged into it (their
                    invoices moved over, visit counts combined) and removed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {group.clients.map((client) => (
                      <label
                        key={client.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          keepId === client.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`keep-${group.key}`}
                            checked={keepId === client.id}
                            onChange={() =>
                              setSelectedKeep((prev) => ({ ...prev, [group.key]: client.id }))
                            }
                          />
                          <div>
                            <p className="font-medium">{client.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {invoiceCountFor(client.id)} invoices · {client.visitCount} visits ·
                              since {new Date(client.createdAt).toLocaleDateString()}
                              {client.address ? ` · ${client.address}` : ""}
                            </p>
                          </div>
                        </div>
                        {keepId === client.id && <Badge>Keep this one</Badge>}
                      </label>
                    ))}
                  </div>
                  <Button
                    onClick={() => handleMerge(group.key, group.clients.map((c) => c.id))}
                    disabled={mergingKey === group.key}
                    className="flex items-center gap-2"
                  >
                    <Merge className="h-4 w-4" />
                    {mergingKey === group.key ? "Merging..." : "Merge Duplicates"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
