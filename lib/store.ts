'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Invoice, Client } from './types'

interface InvoiceStore {
  invoices: Invoice[]
  clients: Client[]
  addInvoice: (invoice: Invoice) => void
  updateInvoice: (id: string, invoice: Invoice) => void
  deleteInvoice: (id: string) => void
  addClient: (client: Client) => void
  updateClient: (id: string, client: Client) => void
  loadData: () => void
}

export const useInvoiceStore = create<InvoiceStore>()(
  persist(
    (set, get) => ({
      invoices: [],
      clients: [],
      
      addInvoice: (invoice) => {
        set((state) => ({
          invoices: [invoice, ...state.invoices],
        }))
        
        // Update client visit count
        const client = invoice.client
        const existingClient = get().clients.find(c => c.id === client.id)
        if (existingClient) {
          get().updateClient(client.id, {
            ...existingClient,
            visitCount: existingClient.visitCount + 1,
            lastVisit: new Date().toISOString(),
          })
        }
      },
      
      updateInvoice: (id, invoice) => {
        set((state) => ({
          invoices: state.invoices.map((inv) =>
            inv.id === id ? invoice : inv
          ),
        }))
      },
      
      deleteInvoice: (id) => {
        set((state) => ({
          invoices: state.invoices.filter((inv) => inv.id !== id),
        }))
      },
      
      addClient: (client) => {
        set((state) => ({
          clients: [client, ...state.clients],
        }))
      },
      
      updateClient: (id, client) => {
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === id ? client : c
          ),
        }))
      },
      
      loadData: () => {
        // This function is called to trigger any initialization if needed
        // The persist middleware handles loading from localStorage automatically
      },
    }),
    {
      name: 'invoice-storage',
      version: 1,
    }
  )
)
