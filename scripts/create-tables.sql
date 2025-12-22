-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- Create clients table
CREATE TABLE clients (
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

-- Create invoices table
CREATE TABLE invoices (
  id VARCHAR(20) PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  total DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  pickup_date DATE,
  pickup_time TIME,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoice_items table
CREATE TABLE invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id VARCHAR(20) REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

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
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at 
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now - you can restrict later)
CREATE POLICY "Allow all operations on clients" ON clients FOR ALL USING (true);
CREATE POLICY "Allow all operations on invoices" ON invoices FOR ALL USING (true);
CREATE POLICY "Allow all operations on invoice_items" ON invoice_items FOR ALL USING (true);

-- Insert some sample data for testing
INSERT INTO clients (name, phone, address, visit_count) VALUES 
('John Doe', '+250788123456', 'Kigali, Rwanda', 2),
('Jane Smith', '+250788654321', 'Butare, Rwanda', 1);
