# KMIE Class Link, Attendance, Approval & Delivery Management System

A small full-stack take-home implementation for KMIE. The assignment requires server-side authorization, approval gating, batch isolation, database uniqueness, deterministic partial delivery, idempotent retry, reporting, automated tests, Docker, migrations and documentation.

## Architecture
- React + TypeScript + Vite + Tailwind frontend
- FastAPI + Pydantic + SQLAlchemy 2.x backend
- PostgreSQL persistence with Alembic migrations
- JWT authentication with bcrypt password hashes
- Local deterministic delivery simulation; no real email/Zoom provider

## Run with Docker
```bash
docker compose up --build
```
Backend: http://localhost:8000/docs
Frontend: run separately with `cd frontend && npm install && npm run dev`.

## Local backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

## Frontend
```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

## Demo credentials
- staff@example.com / Staff@123
- reviewer@example.com / Reviewer@123
- rahul@example.com / Student@123
- priya@example.com / Student@123
- arjun@example.com / Student@123
- neha@example.com / Student@123
- kiran@example.com / Student@123
- aman@example.com / Student@123

All demo email addresses use example.com as required.

## Core state machines
Session: DRAFT -> APPROVED. Editing an approved session invalidates approval and returns it to DRAFT. Only REVIEWER can approve.

Delivery: PENDING -> SENT or FAILED. Initial delivery deterministically sends the first two eligible recipients and stops. Retry processes only PENDING/FAILED. SENT rows are never retried and the `(student_id, session_id)` unique constraint prevents duplicates.

## API
- POST `/api/auth/login`
- POST `/api/sessions`
- GET `/api/sessions`
- PUT `/api/sessions/{id}`
- POST `/api/sessions/{id}/approve`
- GET `/api/student/sessions`
- POST `/api/student/sessions/{id}/attendance`
- POST `/api/sessions/{id}/deliver`
- POST `/api/sessions/{id}/retry-delivery`
- GET `/api/sessions/{id}/deliveries`
- GET `/api/staff/report?batch_id=...&date=...`
- GET `/api/staff/batches`

FastAPI OpenAPI is available at `/docs` and `/redoc`.

## Database
Batch 1:N Student; Batch 1:N Session; Student 1:N Attendance; Session 1:N Attendance; Student 1:N LinkDelivery; Session 1:N LinkDelivery; Student 0/1 User.

Critical database constraints: unique batch name, student email, user email, `(batch_id,date,type)`, `(student_id,session_id)` attendance, `(student_id,session_id)` delivery.

## Security
Authorization is enforced in FastAPI dependencies. Student batch is derived from the authenticated user's linked Student record; client-supplied batch IDs are never used for student session filtering. Passwords are hashed. JWT carries identity/role, but server loads the User from the database. Errors avoid raw SQL/stack traces.

For this local take-home, JWT is stored in localStorage by the demo frontend; production deployments should prefer secure HttpOnly cookies and CSRF protection.

## Tests
Prepare a PostgreSQL test database, migrate and seed it, then:
```bash
cd backend
pytest -q
```
Tests cover authentication boundaries, duplicate attendance, batch isolation behavior and role restrictions. Add/extend integration fixtures when changing schema or workflow logic.

## Five-minute demonstration
1. Login as staff and show seeded BATCH-A LIVE/RECORDED sessions are DRAFT.
2. Login as student and show no draft sessions appear.
3. Login as reviewer, approve LIVE session, then staff delivers it.
4. First delivery produces 2 SENT + 1 PENDING for BATCH-A.
5. Retry produces 3 SENT without creating new delivery rows or incrementing already-SENT attempts.
6. Edit an approved session and show it returns to DRAFT, requiring reapproval.
7. Submit attendance twice and show 201 then 409.
8. Try to use a different student's ID and show server rejection.

## Traceability
See `REQUIREMENTS.md` for requirement -> implementation -> automated test -> demo mapping.
