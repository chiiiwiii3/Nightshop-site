import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export const supabase = createClient(
  "https://yppuanqofgpiskffiyvf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcHVhbnFvZmdwaXNrZmZpeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTI1MDgsImV4cCI6MjEwOTI4ODUwOH0.tYoFrt1PQ7Ur-XioMyb_SzdDnJwjNUcJw3VXPy_zQAI"
);