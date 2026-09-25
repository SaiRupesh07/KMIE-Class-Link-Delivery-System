# Requirement Traceability

| Assignment Requirement | Implementation | Automated Test | Demo |
|---|---|---|---|
| PostgreSQL persistence | SQLAlchemy + Alembic | API integration suite | Run stack |
| New sessions are DRAFT | session create route | session workflow tests | Demo 1 |
| Reviewer-only approval | approval dependency | `test_staff_cannot_approve` | Demo 4 |
| Editing approval invalidates it | update route | workflow test target | Demo 4 |
| Student approved-session access | `/api/student/sessions` | integration suite | Demo 1/2 |
| Batch isolation | server-side student batch derivation | isolation test | Demo 2 |
| Attendance validation | student attendance route | duplicate test | Demo 3 |
| Unique attendance | DB unique constraint + catch | duplicate test | Demo 3 |
| Approved-only delivery | delivery service | add delivery integration test | Demo 4 |
| Partial deterministic delivery | `process(..., retry=False)` | delivery integration test | Demo 5 |
| Retry PENDING/FAILED only | retry route | delivery integration test | Demo 5 |
| SENT idempotency | skip SENT + unique DB row | retry integration test | Demo 5 |
| Delivery report | `/deliveries` | report integration test | Demo 5 |
| Staff report | `/api/staff/report` | report test | Dashboard |
| JWT + hashed passwords | security module | auth tests | Login |
| Docker | `docker-compose.yml` | build/start check | Run stack |
| API docs | FastAPI `/docs`, `/redoc` | startup check | Open docs |
