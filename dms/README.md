# DMS setup
1. Supabase: run `schema.sql` in SQL Editor. Create users under Authentication (1 admin + 1 per transporter), then insert their `profiles` rows (see end of schema.sql).
2. Put Project URL + anon key in `config.js`.
3. Log in as admin. Masters > Import transporters.csv, then dealers.csv. Then Invoices > Import CSV with invoices_history.csv (your 732 tracker rows). New invoices: Invoices > Upload invoice PDF.
4. Deploy: push this folder to GitHub, import in Vercel (framework: Other, no build). Done.
5. Demo: on the sign-in screen use "Demo as HQ" or "Demo as transporter" for sample data (nothing is saved). No new database changes are needed for the dashboards: they are calculated from your existing tables.
