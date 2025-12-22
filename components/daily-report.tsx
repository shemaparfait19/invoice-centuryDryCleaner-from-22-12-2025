// Replace the entire component with a redirect to advanced reports
'use client'

import { useEffect } from 'react'
import { AdvancedReports } from './advanced-reports'

export function DailyReport() {
  return <AdvancedReports />
}
