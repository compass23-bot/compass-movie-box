# Compass Movie Box

Full-stack movie/entertainment website using Node.js, Express, SQLite, JWT cookies, bcrypt and Multer.

## Run locally
1. Install Node.js 20+.
2. Open this folder in VS Code terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change the admin password and JWT secret.
5. Run `npm start`.
6. Open http://localhost:3000 in Chrome.

## Admin
The first startup creates an admin account from ADMIN_EMAIL and ADMIN_PASSWORD in `.env`.

## Important production note
This version is deploy-ready for a Node host, but SQLite and local file uploads are not ideal on hosts with ephemeral disks. For a serious production site, migrate the database to PostgreSQL and uploads to object storage (S3/Cloudinary/Supabase Storage), then set HTTPS and a strong JWT secret.

## Deploy
Use any Node.js host that supports persistent storage. Set build/install command `npm install` and start command `npm start`, and add the environment variables from `.env.example`. Do not commit `.env`.
