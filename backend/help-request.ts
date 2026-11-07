// Deployed as the Supabase Edge Function "help-request" (Verify JWT off).
// Anyone, even signed out, can leave the owner one note from the shadowman window outside.
// Stored in the messages table with no customer, tagged "🆘HELP|name|contact|message"; capped at 15 per hour.
// The owner sees them under "Help requests" in the profile's Orders tab; Done marks the row with the usual ✅ DONE reply.
// (Source is kept in the Supabase project; see the deployed function.)
