# INTENDFLASH

College Event Registration & Attendance Authorization System.

## Stack

- Node.js
- Express
- EJS
- PostgreSQL (Supabase-compatible)
- Render deployment configuration

## Roles

Student · Event Coordinator · Academic Coordinator · Teacher · Admin

## Data model

Department → Year → Section → Student.

Events can be created by an Event Coordinator and registered for by students. Attendance is recorded by the Event Coordinator and appears on student/teacher dashboards. Academic permission letters are stored by the Academic Coordinator for future reference. Admin records system and student activity.

## Local setup

```bash
npm install
copy .env.example .env
```

Set `DATABASE_URL` in `.env`, then initialize the database:

```bash
npm run db:init
npm run db:seed
npm start
```

Open `http://localhost:3000`.

## Cloud deployment

The project includes `render.yaml` for a Render Node web service. Set `DATABASE_URL` as a secret environment variable in Render using the Supabase PostgreSQL connection string. Never commit `.env` or a database password.

## Security note

The seed accounts are demo accounts only. Before real college use, replace them with real accounts and move password storage to a proper password-hashing flow.
