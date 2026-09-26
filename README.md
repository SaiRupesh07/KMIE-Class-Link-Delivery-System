# KMIE Class Link, Attendance, Approval & Delivery Management System

A full-stack system for managing class sessions, reviewer approval, student attendance, enrolled students, and class-link delivery — with server-side authorization, approval gating, batch isolation, and idempotent retry handling.

## Live Demo

| Resource | Link |
|---|---|
| Frontend | https://kmie-class-link-delivery-system.onrender.com |
| Swagger / OpenAPI | https://kmie-backend.onrender.com/docs |
| ReDoc | https://kmie-backend.onrender.com/redoc |
| GitHub Repository | https://github.com/SaiRupesh07/KMIE-Class-Link-Delivery-System |

## Overview

The system supports three roles — **Staff**, **Reviewer**, and **Student**:

- Staff create and manage class sessions, view enrolled students by batch, and manage attendance.
- Reviewers must approve sessions before students can see them.
- Students see only approved sessions from their own batch.
- Attendance cannot be duplicated; delivery is deterministic and safely retryable.
- All authorization is enforced on the backend, not the frontend.

## Architecture

```
React (TypeScript + Vite + Tailwind CSS)
        │  REST / JSON + JWT Bearer
        ▼
FastAPI (Pydantic + SQLAlchemy 2.x + JWT + RBAC)
        │  SQLAlchemy ORM
        ▼
PostgreSQL
```

**Deployment:** GitHub → Render Static Site (frontend) + Render Web Service (backend) → Render PostgreSQL

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, Fetch API |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy 2.x, JWT, bcrypt/passlib |
| Database | PostgreSQL, SQLAlchemy ORM, Alembic migrations |
| Testing | pytest, FastAPI TestClient, httpx |
| Deployment | GitHub, Render Static Site, Render Web Service, Render PostgreSQL |

## User Roles

| Role | Can | Cannot |
|---|---|---|
| Staff | Create/edit sessions, view batches & enrolled students, manage attendance, deliver & retry links, generate reports | Approve sessions |
| Reviewer | View sessions, approve DRAFT sessions | Create sessions, manage attendance, deliver links |
| Student | View approved sessions in own batch, mark own attendance | Approve/create sessions, deliver links, access other batches |

## Core Workflows

**Session approval**
```
DRAFT → (Reviewer approves) → APPROVED → (Staff edits) → DRAFT
```

**Delivery**
```
PENDING/FAILED → (retry) → SENT   (already-SENT records are never re-sent)
```

**Attendance**
```
NOT MARKED → PRESENT | ABSENT   (one record per student/session, enforced by a DB constraint)
```

Enrolled students are derived from the actual `Batch → Student` database relationship, not inferred from sessions. A student's batch is always resolved server-side from the authenticated user — never trusted from client input.

## Database Design

```
BATCH ──1:N── STUDENT ──1:N── ATTENDANCE
  │               │
  │               └──0/1── USER
  │
  └──1:N── SESSION ──1:N── LINK_DELIVERY
```

| Table | Key Fields | Constraints |
|---|---|---|
| BATCH | id, name | name unique |
| STUDENT | id, name, email, batch_id | email unique, batch_id FK |
| USER | id, name, email, password_hash, role, student_id | email unique, student_id FK |
| SESSION | id, batch_id, date, time, type, status, subject, teacher | (batch_id, date, type) unique |
| ATTENDANCE | id, student_id, session_id, status | (student_id, session_id) unique |
| LINK_DELIVERY | id, student_id, session_id, status, attempts | (student_id, session_id) unique |

## Security

- JWT bearer authentication; passwords hashed with bcrypt/passlib.
- Server-side role-based access control on every protected endpoint.
- Backend derives batch ownership from the authenticated user; cross-batch access is rejected.
- CORS configured per environment; secrets stored via environment variables.
- Errors are handled without exposing raw SQL or stack traces.

## API Reference

Full interactive docs: [Swagger](https://kmie-backend.onrender.com/docs) · [ReDoc](https://kmie-backend.onrender.com/redoc)

| Endpoint | Role | Description |
|---|---|---|
| `POST /api/auth/login` | Public | Authenticate and receive JWT |
| `POST /api/sessions` | Staff | Create a DRAFT session |
| `GET /api/sessions` | Staff/Reviewer | List sessions |
| `PUT /api/sessions/{id}` | Staff | Update a session |
| `POST /api/sessions/{id}/approve` | Reviewer | Approve a DRAFT session |
| `GET /api/student/sessions` | Student | List approved sessions in own batch |
| `POST /api/student/sessions/{id}/attendance` | Student | Mark own attendance |
| `GET /api/staff/sessions/{id}/attendance` | Staff | View attendance roster |
| `PUT /api/staff/sessions/{id}/attendance/{student_id}` | Staff | Create/update attendance |
| `POST /api/sessions/{id}/deliver` | Staff | Initial deterministic delivery |
| `POST /api/sessions/{id}/retry-delivery` | Staff | Retry PENDING/FAILED deliveries |
| `GET /api/sessions/{id}/deliveries` | Staff | View delivery records |
| `GET /api/staff/report?batch_id=&date=` | Staff | Attendance/delivery report |
| `GET /api/staff/batches` | Staff | Batches with enrolled student info |

## Getting Started

### With Docker

```bash
docker compose up --build
```
Backend: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

### Without Docker

**Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
# configure .env
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev        # development
npm run build       # production build
npm run lint
```

## Testing

```bash
cd backend
pytest -q
```

Covers authentication, role restrictions, session lifecycle, batch isolation, cross-batch rejection, attendance (including duplicates), delivery, and retry behavior.

**Latest result:** 15 passed

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Staff | staff@example.com | Staff@123 |
| Reviewer | reviewer@example.com | Reviewer@123 |
| Student | rahul@example.com | Student@123 |
| Student | priya@example.com | Student@123 |
| Student | arjun@example.com | Student@123 |

*All demo accounts use `@example.com` and are for demonstration/testing only.*

## Deployment (Render)

**Backend** — root: `backend` · build: `pip install -r requirements.txt` · start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
Env vars: `DATABASE_URL`, `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORS_ORIGINS`

**Frontend** — root: `frontend` · build: `npm install && npm run build` · publish dir: `dist`
Env var: `VITE_API_URL=https://kmie-backend.onrender.com`

**Database** — the backend uses the PostgreSQL *Internal* URL at runtime; migrations/seeding can be run locally against the *External* URL when Render shell access is unavailable. Never commit the external database URL.

## Environment Variables

```
DATABASE_URL=postgresql+psycopg://username:password@host/database
JWT_SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:8000   # or the production backend URL
```

Never commit `.env` or `.env.backup`. The demo frontend stores JWTs in `localStorage`; a production build should use HttpOnly cookies with CSRF protection instead.

## Troubleshooting

| Symptom | Fix |
|---|---|
| CORS error in browser | Ensure `CORS_ORIGINS` matches the deployed frontend URL |
| `relation "users" does not exist` | Run `alembic upgrade head` and re-seed |
| Empty batch/student data | Run the seed script; verify Batch → Student relationships |
| Staff attendance endpoint returns 404 locally | Rebuild/restart the backend so the latest router loads |
| Frontend cannot connect to backend | Verify `VITE_API_URL` |
| No Render shell available | Run migrations/seeding locally via the External Database URL |

## Business Rules Summary

| Rule | Behavior |
|---|---|
| Duplicate batch name / student email / user email | Rejected |
| Duplicate session (batch, date, type) | Rejected |
| Approved session edited | Reverts to DRAFT |
| Cross-batch access | Rejected server-side |
| Duplicate attendance | `409 Conflict` |
| Attendance for unapproved session or wrong batch | Rejected |
| Delivery before approval | Rejected |
| Already-SENT delivery | Never re-sent |
| Duplicate delivery row | Prevented by DB constraint |
| Reports | Staff-only |

## Project Structure

```
KMIE/
├── backend/
│   ├── app/
│   │   ├── api/          # auth, sessions, student, delivery, reports, staff_attendance
│   │   ├── core/         # config, security
│   │   ├── db/           # session
│   │   ├── models/
│   │   └── schemas/
│   ├── alembic/versions/
│   ├── seed.py
│   ├── requirements.txt
│   └── tests/test_api.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── main.tsx
│   └── package.json
├── REQUIREMENTS.md
├── docker-compose.yml
└── README.md
```

## Future Improvements

- Real email/SMS/Zoom delivery integrations
- Background jobs (Redis/Celery)
- Audit logs, pagination and search
- Refresh tokens with HttpOnly cookie auth + CSRF protection
- CI/CD pipeline, structured logging, monitoring

## Project Status

**Production Ready** — locally developed and tested, migrated and seeded, backend tests passing (15/15), frontend linted and built, deployed to Render, and manually verified across Staff, Reviewer, and Student workflows.

Additional docs: `REQUIREMENTS.md`, `/docs`, `/redoc`
