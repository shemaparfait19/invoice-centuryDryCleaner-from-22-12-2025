'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WifiOff } from 'lucide-react'

export function DatabaseSetup() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="h-5 w-5" />
            No Internet Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You are not connected to the internet. Please check your connection and try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}