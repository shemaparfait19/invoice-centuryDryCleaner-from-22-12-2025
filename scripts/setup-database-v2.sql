-- Century Dry Cleaner Database Setup - Version 2
-- This script will create all necessary tables and data

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

SELECT 'Database setup completed successfully!' as status;
