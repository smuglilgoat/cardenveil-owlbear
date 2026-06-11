import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.URL,
  process.env.SERVICE_ROLE_KEY
);

export default supabase;
