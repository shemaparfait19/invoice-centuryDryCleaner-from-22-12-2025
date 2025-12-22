'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useSupabaseStore } from '@/lib/supabase-store'

export function RealTimeStatusIndicator() {
  const [isConnected, setIsConnected] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const { realtimeChannel, invoices } = useSupabaseStore()

  useEffect(() => {
    // Monitor connection status
    const checkConnection = () => {
      setIsConnected(!!realtimeChannel)
    }

    checkConnection()
    const interval = setInterval(checkConnection, 5000)

    return () => clearInterval(interval)
  }, [realtimeChannel])

  useEffect(() => {
    // Update last update time when invoices change
    setLastUpdate(new Date())
  }, [invoices])

  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge 
        variant="outline" 
        className={`flex items-center gap-1 ${
          isConnected ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'
        }`}
      >
        {isConnected ? (
          <>
            <Wifi className="h-3 w-3" />
            Live Updates
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            Offline
          </>
        )}
      </Badge>
      
      <span className="text-muted-foreground">
        Last sync: {lastUpdate.toLocaleTimeString()}
      </span>
      
      <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" style={{
        animationDuration: isConnected ? '2s' : '0s'
      }} />
    </div>
  )
}
