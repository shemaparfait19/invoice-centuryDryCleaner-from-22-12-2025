'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useSupabaseStore } from '@/lib/supabase-store'

// Stays silent while everything is working — a healthy connection doesn't
// need to announce itself. Only speaks up if live updates actually drop.
export function RealTimeStatusIndicator() {
  const [isConnected, setIsConnected] = useState(true)
  const { realtimeChannel } = useSupabaseStore()

  useEffect(() => {
    const checkConnection = () => setIsConnected(!!realtimeChannel)
    checkConnection()
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [realtimeChannel])

  if (isConnected) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 w-fit">
      <WifiOff className="h-3.5 w-3.5" />
      Reconnecting…
    </div>
  )
}
