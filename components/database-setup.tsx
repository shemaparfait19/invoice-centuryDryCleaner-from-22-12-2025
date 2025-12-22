'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Database, ExternalLink, Copy, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { useSupabaseStore } from '@/lib/supabase-store'
import { toast } from '@/hooks/use-toast'

export function DatabaseSetup() {
  const [copied, setCopied] = useState(false)
  const { checkDatabaseSetup, initializeDatabase, loading, databaseReady } = useSupabaseStore()

  const sqlScript = `-- Century Dry Cleaner Database Setup - Version 2
-- Copy and paste this entire script into your Supabase SQL Editor

-- First, let's check if we're connected properly
SELECT current_database(), current_user, version();

-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- Drop existing functions and triggers
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Create clients table in public schema explicitly
CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  address TEXT,
  visit_count INTEGER DEFAULT 0,
  reward_claimed BOOLEAN DEFAULT FALSE,
  last_visit TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoices table in public schema explicitly
CREATE TABLE public.invoices (
  id VARCHAR(20) PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  total DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  pickup_date DATE,
  pickup_time TIME,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoice_items table in public schema explicitly
CREATE TABLE public.invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id VARCHAR(20) REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_clients_phone ON public.clients(phone);
CREATE INDEX idx_clients_name ON public.clients(name);
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoices_created_at ON public.invoices(created_at);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_pickup_date ON public.invoices(pickup_date);
CREATE INDEX idx_invoices_pickup_time ON public.invoices(pickup_time);
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_clients_updated_at 
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at 
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Disable Row Level Security temporarily for setup
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on clients" ON public.clients;
DROP POLICY IF EXISTS "Allow all operations on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all operations on invoice_items" ON public.invoice_items;

-- Re-enable Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now)
CREATE POLICY "Allow all operations on clients" ON public.clients FOR ALL USING (true);
CREATE POLICY "Allow all operations on invoices" ON public.invoices FOR ALL USING (true);
CREATE POLICY "Allow all operations on invoice_items" ON public.invoice_items FOR ALL USING (true);

-- Insert sample data for testing
INSERT INTO public.clients (name, phone, address, visit_count) VALUES 
('John Doe', '+250788123456', 'Kigali, Rwanda', 2),
('Jane Smith', '+250788654321', 'Butare, Rwanda', 1),
('Alice Johnson', '+250788111222', 'Musanze, Rwanda', 0),
('Bob Wilson', '+250788333444', 'Rubavu, Rwanda', 3),
('Carol Brown', '+250788555666', 'Huye, Rwanda', 1);

-- Insert sample invoices with pickup times for testing notifications
INSERT INTO public.invoices (id, client_id, total, payment_method, status, pickup_date, pickup_time, notes) 
SELECT 
  'INV' || TO_CHAR(NOW(), 'YYMMDD') || '001',
  c.id,
  15000.00,
  'CASH',
  'pending',
  CURRENT_DATE + INTERVAL '1 day',
  '14:30:00',
  'Test pickup notification'
FROM public.clients c WHERE c.phone = '+250788123456'
LIMIT 1;

-- Insert invoice items for the sample invoice
INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total_price)
SELECT 
  'INV' || TO_CHAR(NOW(), 'YYMMDD') || '001',
  'Dry Cleaning - Suit',
  2,
  7500.00,
  15000.00;

-- Grant necessary permissions
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoice_items TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Verify tables were created successfully
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('clients', 'invoices', 'invoice_items')
ORDER BY tablename;

-- Show sample data
SELECT 'Sample clients created:' as info;
SELECT name, phone FROM public.clients LIMIT 3;

SELECT 'Sample invoices created:' as info;
SELECT id, total, pickup_date, pickup_time FROM public.invoices LIMIT 3;

SELECT 'Database setup completed successfully!' as status;`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript)
      setCopied(true)
      toast({
        title: 'SQL script copied!',
        description: 'Paste it into your Supabase SQL Editor and run it'
      })
      setTimeout(() => setCopied(false), 3000)
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Please manually copy the SQL script',
        variant: 'destructive'
      })
    }
  }

  const handleRetryConnection = async () => {
    await initializeDatabase()
  }

  const handleCheckSetup = async () => {
    const isReady = await checkDatabaseSetup()
    if (isReady) {
      toast({
        title: 'Database is ready!',
        description: 'All tables are properly set up.'
      })
    } else {
      toast({
        title: 'Database not ready',
        description: 'Please run the setup script first.',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Setup Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The database tables need to be created in your Supabase project. This updated script explicitly creates tables in the public schema and includes sample data for testing.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Setup Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Copy the SQL script below (click the Copy button)</li>
              <li>Open your Supabase project dashboard</li>
              <li>Go to the <strong>SQL Editor</strong> section</li>
              <li>Create a new query and paste the entire script</li>
              <li>Click <strong>"Run"</strong> to execute the script</li>
              <li>Wait for all commands to complete successfully</li>
              <li>Click "Check Database Setup" below to verify</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">SQL Setup Script (Version 2):</h3>
              <div className="flex gap-2">
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy Script'}
                </Button>
                <Button
                  onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Supabase
                </Button>
              </div>
            </div>

            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96">
              <pre className="text-xs whitespace-pre-wrap">{sqlScript}</pre>
            </div>
          </div>

          <div className="flex gap-4">
            <Button 
              onClick={handleCheckSetup}
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Check Database Setup
            </Button>
            
            <Button 
              onClick={handleRetryConnection}
              disabled={loading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Connection
            </Button>
          </div>

          {databaseReady && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Database is properly set up! The system includes sample data and pickup notification testing. You can now use the invoice management system.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
