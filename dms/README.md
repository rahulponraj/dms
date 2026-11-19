# DMS setup
1. Supabase: run `schema.sql` in SQL Editor. Create users under Authentication (1 admin + 1 per transporter), then insert their `profiles` rows (see end of schema.sql).
2. Put Project URL + anon key in `config.js`.
3. Log in as admin, use Masters > Import to upload transporters.csv, then dealers.csv, then Invoices > Import invoices.csv (templates/ folder).
4. Deploy: push this folder to GitHub, import in Vercel (framework: Other, no build). Done.
 