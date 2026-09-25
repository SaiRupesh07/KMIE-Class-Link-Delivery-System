# KMIE Class Link, Attendance, Approval & Delivery Management System

A full-stack system for managing class sessions, reviewer approval, student attendance, class-link delivery, retry handling, reporting, authentication, and role-based authorization — built with server-side authorization, approval gating, batch isolation, database uniqueness constraints, deterministic delivery, idempotent retry, automated testing, Docker, and production deployment.

---

## 🚀 Live Demo

| Resource | Link |
|---|---|
| Frontend | https://kmie-class-link-delivery-system.onrender.com |
| Backend API | https://kmie-backend.onrender.com |
| Swagger / OpenAPI | https://kmie-backend.onrender.com/docs |
| ReDoc | https://kmie-backend.onrender.com/redoc |
| GitHub Repository | https://github.com/SaiRupesh07/KMIE-Class-Link-Delivery-System |

---

## 📌 Overview

The system supports three roles — **Staff**, **Reviewer**, and **Student** — with the following guarantees:

- Staff create and manage class sessions.
- Reviewers must approve sessions before students can see them.
- Students see only approved sessions from their own batch.
- Attendance cannot be duplicated.
- Class-link delivery is deterministic and safely retryable.
- Already-delivered links are never re-sent on retry.
- Reports are Staff-only.
- All authorization is enforced on the backend, not the frontend.

---

## 🏗️ Architecture

```
React (TS + Vite + Tailwind)
        │  REST / JSON, JWT Bearer
        ▼
FastAPI (Pydantic, SQLAlchemy 2.x, JWT Auth, RBAC)
        │  SQLAlchemy
        ▼
PostgreSQL (Batch, Student, User, Session, Attendance, Link Delivery)
```

**Deployment:** GitHub → Render Static Site (frontend) + Render Web Service (FastAPI backend) → Render PostgreSQL.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, Fetch API |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy 2.x, JWT, bcrypt/passlib |
| Database | PostgreSQL, SQLAlchemy ORM, Alembic migrations |
| Testing | pytest, FastAPI TestClient, httpx |
| Deployment | GitHub, Render (Static Site, Web Service, PostgreSQL) |
| Development | VS Code, Docker Desktop, Docker Compose |

---

## 👥 User Roles

| Role | Can | Cannot |
|---|---|---|
| **Staff** | Create/edit sessions, manage batches, deliver & retry class links, view delivery status, view attendance reports | — |
| **Reviewer** | View sessions pending approval, approve DRAFT sessions | Create sessions, deliver links |
| **Student** | View approved sessions in their own batch, mark attendance | Approve/create sessions, deliver links, view reports, access other batches |

---

## 🔄 Core State Machines

**Session:** `DRAFT → APPROVED` (via Reviewer). Editing an approved session resets it to `DRAFT`, requiring re-approval.

**Delivery:** `PENDING → SENT / FAILED`. Retry processes only `PENDING`/`FAILED` records — `SENT` is never retried. Initial delivery deterministically sends to the first two eligible recipients; the rest stay `PENDING` until retried. A unique `(student_id, session_id)` constraint prevents duplicate delivery rows, making retries idempotent.

---

## 🗄️ Database Design

```
BATCH ──1:N── STUDENT ──1:N── ATTENDANCE
  │               │
  └──1:N── SESSION ──1:N── LINK_DELIVERY
                │
          STUDENT ──0/1── USER
```

| Table | Key Fields | Constraints |
|---|---|---|
| `BATCH` | id, name | `name` unique |
| `STUDENT` | id, name, email, batch_id | `email` unique, `batch_id` FK |
| `USER` | id, name, email, password_hash, role, student_id | `email` unique, `student_id` FK |
| `SESSION` | id, batch_id, date, type, status, subject, teacher | `(batch_id, date, type)` unique |
| `ATTENDANCE` | id, student_id, session_id, status | `(student_id, session_id)` unique |
| `LINK_DELIVERY` | id, student_id, session_id, status, attempts | `(student_id, session_id)` unique |

---

## 🔐 Security

- Password hashing (bcrypt), JWT bearer authentication.
- Server-side role-based access control — the frontend cannot bypass authorization by editing IDs or requests.
- A student's batch is always derived server-side (`User → Student → batch_id`), never from client-supplied input.
- CORS configuration and environment-based secrets.
- Errors are handled without exposing raw SQL or stack traces.

**Login flow:** `POST /api/auth/login` → verify password hash → issue JWT → subsequent requests use `Authorization: Bearer <JWT>`.

---

## 📚 API Reference

Full interactive docs: [Swagger](https://kmie-backend.onrender.com/docs) · [ReDoc](https://kmie-backend.onrender.com/redoc)

| Endpoint | Role | Description |
|---|---|---|
| `POST /api/auth/login` | — | Authenticate and receive a JWT |
| `POST /api/sessions` | Staff | Create a session |
| `GET /api/sessions` | Staff | List sessions |
| `PUT /api/sessions/{id}` | Staff | Update a session (approved → resets to DRAFT) |
| `POST /api/sessions/{id}/approve` | Reviewer | Approve a DRAFT session |
| `GET /api/student/sessions` | Student | List approved sessions in own batch |
| `POST /api/student/sessions/{id}/attendance` | Student | Mark attendance (duplicate → `409 Conflict`) |
| `POST /api/sessions/{id}/deliver` | Staff | Initial deterministic delivery (first 2 recipients) |
| `POST /api/sessions/{id}/retry-delivery` | Staff | Retry only PENDING/FAILED deliveries |
| `GET /api/sessions/{id}/deliveries` | Staff | View delivery records |
| `GET /api/staff/report?batch_id=&date=` | Staff | Attendance report |
| `GET /api/staff/batches` | Staff | List batches |

---

## 🐳 Running with Docker

```bash
docker compose up --build
```
- Backend: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Frontend (run separately): `cd frontend && npm install && npm run dev`

---

## 💻 Local Setup (without Docker)

**Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # or create manually on Windows PowerShell
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

---

## 🧪 Testing

```bash
cd backend
pytest -q
```

Covers authentication boundaries, role restrictions, duplicate attendance, batch isolation, session workflow, delivery behavior, and business-rule validation.

**Latest local run:** `8 passed`, `85 warnings` (dependency/deprecation warnings only — no test failures).

---

## 🔄 Five-Minute Demo Flow

1. **Staff login** (`staff@example.com`) — seeded BATCH-A sessions show as `DRAFT`.
2. **Student login** (`rahul@example.com`) — draft sessions are not visible.
3. **Reviewer login** (`reviewer@example.com`) — approve the session (`DRAFT → APPROVED`).
4. **Staff delivers** the session — expect `2 SENT`, `1 PENDING`.
5. **Retry delivery** — expect `3 SENT`, no new rows created, no re-sends.
6. **Edit the approved session** — it resets to `DRAFT` and needs re-approval.
7. **Submit attendance twice** — first returns `201`, second returns `409 Conflict`.
8. **Attempt cross-batch/student access** — server rejects it, confirming batch isolation.

### Demo Credentials

| Role | Email | Password |
|---|---|---|
| Staff | staff@example.com | Staff@123 |
| Reviewer | reviewer@example.com | Reviewer@123 |
| Student | rahul@example.com / priya@example.com / arjun@example.com / neha@example.com / kiran@example.com / aman@example.com | Student@123 |

*All demo accounts use `example.com` and are for demonstration only.*

---

## ☁️ Deployment (Render)

**Backend**
- Root directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Env vars: `DATABASE_URL`, `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORS_ORIGINS`

**Frontend**
- Root directory: `frontend`
- Build: `npm install && npm run build`
- Publish directory: `dist`
- Env var: `VITE_API_URL=https://kmie-backend.onrender.com`

**Database:** Render backend uses the PostgreSQL Internal Database URL at runtime. Migrations (`alembic upgrade head`) and seeding (`python seed.py`) were run once from a local machine against the External Database URL, since the Render free tier has no shell access. The backend runs independently afterward.

---

## 🔐 Environment Variables

```env
DATABASE_URL=postgresql+psycopg://username:password@host/database
JWT_SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173
```
Never commit `.env` or `.env.backup` — only `.env.example` should be tracked. Demo JWTs are stored in `localStorage`; a production build should use HttpOnly cookies with CSRF protection instead.

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| CORS error in browser | Ensure `CORS_ORIGINS` matches the deployed frontend URL |
| `relation "users" does not exist` | Run `alembic upgrade head` and `python seed.py` against the production DB |
| No Render shell available | Migrate temporarily using the External Database URL from a local machine; never commit that URL |

---

## 📋 Business Rules Summary

| Rule | Behavior |
|---|---|
| Duplicate batch/student/user email/session | Rejected |
| Draft session | Editable, cannot be delivered |
| Approved session edited | Reverts to `DRAFT` |
| Duplicate attendance | `409 Conflict` |
| Cross-batch access | Rejected server-side |
| Delivery before approval | Rejected |
| Initial delivery | First two eligible recipients |
| Retry | Only `PENDING`/`FAILED`, idempotent |
| Reports | Staff-only |

---

## 🧩 Project Structure

```
KMIE/
├── backend/
│   ├── app/
│   │   ├── api/        # auth, sessions, student, delivery, reports
│   │   ├── core/        # config, security
│   │   ├── db/          # session
│   │   ├── models/
│   │   ├── schemas/
│   │   └── main.py
│   ├── alembic/versions/
│   ├── seed.py
│   └── requirements.txt
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

---

## 📈 Future Improvements

Real email/SMS/Zoom delivery, background jobs (Redis/Celery), audit logs, pagination & search, refresh tokens, HttpOnly cookie auth with CSRF protection, CI/CD, and structured production logging/monitoring.

---

## 👨‍💻 Project Status

**Production Ready ✅** — Locally tested, migrated, seeded, deployed, and manually verified across Staff, Reviewer, and Student workflows.

Additional documentation: `REQUIREMENTS.md` (requirement → implementation → test → demo traceability), `/docs` (Swagger), `/redoc` (ReDoc).
