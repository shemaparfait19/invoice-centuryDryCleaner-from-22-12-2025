-- Users and Audit Logs setup (to be run in Supabase SQL editor)

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL, -- e.g. create, update, delete, status_update
  entity_type TEXT NOT NULL, -- e.g. invoice, client
  entity_id TEXT NOT NULL,
  actor_phone TEXT,
  actor_name TEXT,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

-- Trigger to keep updated_at fresh on users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS and policies (allow all - same as other tables in this app)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on users" ON public.users;
DROP POLICY IF EXISTS "Allow all on audit_logs" ON public.audit_logs;

CREATE POLICY "Allow all on users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow all on audit_logs" ON public.audit_logs FOR ALL USING (true);

-- Optional: seed an admin user placeholder for reference
INSERT INTO public.users (name, phone, role)
VALUES ('Admin', '+250000000000', 'admin')
ON CONFLICT (phone) DO NOTHING;

