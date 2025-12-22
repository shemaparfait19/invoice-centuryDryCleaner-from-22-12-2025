'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  error: string | null
  onRetry: () => void
  onClear: () => void
}

export function ErrorBoundary({ error, onRetry, onClear }: ErrorBoundaryProps) {
  useEffect(() => {
    if (error) {
      console.error('Application error:', error)
    }
  }, [error])

  if (!error) return null

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Something went wrong
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <Button onClick={onRetry} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          <Button onClick={onClear} variant="outline" size="sm">
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
