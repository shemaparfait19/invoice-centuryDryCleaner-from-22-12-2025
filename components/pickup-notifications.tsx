'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, Clock, User, X, Phone, CheckCircle, AlertTriangle } from 'lucide-react'
import { useSupabaseStore } from '@/lib/supabase-store'
import { formatCurrency } from '@/lib/utils'
import type { Invoice } from '@/lib/types'

export function PickupNotifications() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [currentTime, setCurrentTime] = useState(new Date())
  const { invoices, updateInvoiceStatus } = useSupabaseStore()

  // Update current time every minute for exact time matching
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [])

  // Get pickup notifications - trigger when exact time matches
  const getPickupNotifications = () => {
    const now = new Date()
    const currentDate = now.toISOString().split('T')[0] // YYYY-MM-DD format
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`

    console.log('Checking notifications at:', currentDate, currentTimeString)

    return invoices.filter(invoice => {
      // Skip if dismissed, no pickup info, or already completed
      if (dismissed.has(invoice.id) || !invoice.pickupDate || !invoice.pickupTime || invoice.status === 'completed') {
        return false
      }

      // Check if pickup date matches current date
      const isToday = invoice.pickupDate === currentDate
      
      // Check if pickup time matches current time (exact match or within 1 minute)
      const pickupTime = invoice.pickupTime.substring(0, 5) // Get HH:MM format
      const isTimeMatch = pickupTime === currentTimeString

      console.log(`Invoice ${invoice.id}: Date match: ${isToday}, Time match: ${isTimeMatch}, Pickup: ${invoice.pickupDate} ${pickupTime}, Current: ${currentDate} ${currentTimeString}`)

      // Show notification if it's the exact pickup date and time
      return isToday && isTimeMatch
    })
  }

  const notifications = getPickupNotifications()

  const dismissNotification = (invoiceId: string) => {
    setDismissed(prev => new Set([...prev, invoiceId]))
  }

  const markAsCompleted = async (invoice: Invoice) => {
    try {
      await updateInvoiceStatus(invoice.id, 'completed')
      dismissNotification(invoice.id)
    } catch (error) {
      console.error('Error marking invoice as completed:', error)
    }
  }

  const getNotificationUrgency = (invoice: Invoice) => {
    // Since we're showing notifications at exact pickup time, all are urgent
    return 'urgent'
  }

  // Log when notifications are found
  useEffect(() => {
    if (notifications.length > 0) {
      console.log(`Found ${notifications.length} pickup notifications:`, notifications.map(inv => ({
        id: inv.id,
        client: inv.client.name,
        pickupDate: inv.pickupDate,
        pickupTime: inv.pickupTime
      })))
    }
  }, [notifications])

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((invoice) => {
        const urgency = getNotificationUrgency(invoice)
        
        return (
          <Card 
            key={invoice.id} 
            className="shadow-lg border-l-4 border-l-orange-500 bg-orange-50 border-orange-200"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-sm text-orange-800">
                    🔔 PICKUP TIME NOW!
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissNotification(invoice.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-600" />
                  <span className="font-medium">{invoice.client.name}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-600" />
                  <span className="text-sm">{invoice.client.phone}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-orange-700">
                    Scheduled: {invoice.pickupDate} at {invoice.pickupTime}
                  </span>
                </div>

                <div className="text-sm text-gray-600">
                  <strong>Invoice:</strong> {invoice.id}
                </div>
                
                <div className="text-sm text-gray-600">
                  <strong>Total:</strong> {formatCurrency(invoice.total)}
                </div>

                {invoice.notes && (
                  <div className="text-sm text-gray-600">
                    <strong>Notes:</strong> {invoice.notes}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => markAsCompleted(invoice)}
                  className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-3 w-3" />
                  Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`tel:${invoice.client.phone}`, '_self')}
                  className="flex items-center gap-1 text-xs"
                >
                  <Phone className="h-3 w-3" />
                  Call
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`https://wa.me/${invoice.client.phone.replace('+', '')}?text=Hello ${invoice.client.name}, your order is ready for pickup!`, '_blank')}
                  className="flex items-center gap-1 text-xs"
                >
                  💬 WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
