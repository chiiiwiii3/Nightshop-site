import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// Public project URL and public "anon" key. These are designed to be visible in the browser;
// real protection comes from Supabase row-level security and storage policies.
export const SUPABASE_URL = "https://yppuanqofgpiskffiyvf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcHVhbnFvZmdwaXNrZmZpeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTI1MDgsImV4cCI6MjEwOTI4ODUwOH0.tYoFrt1PQ7Ur-XioMyb_SzdDnJwjNUcJw3VXPy_zQAI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
