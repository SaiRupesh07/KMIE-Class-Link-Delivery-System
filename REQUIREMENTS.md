# Requirement Traceability

| Assignment Requirement | Implementation | Automated Test | Demo |
|---|---|---|---|
| PostgreSQL persistence | SQLAlchemy + Alembic | API integration suite | Run stack |
| New sessions are DRAFT | session create route | `test_create_session_with_subject_and_teacher` | Demo 1 |
| Reviewer-only approval | approval dependency | `test_staff_cannot_approve` | Demo 4 |
| Editing approval invalidates it | update route | `test_editing_subject_or_teacher_invalidates_approval_and_can_be_reapproved` | Demo 4 |
| Student approved-session access | `/api/student/sessions` | `test_duplicate_attendance_and_batch_isolation`, `test_student_sees_subject_and_teacher_within_own_batch_only` | Demo 1/2 |
| Batch isolation | server-side student batch derivation | `test_duplicate_attendance_and_batch_isolation` | Demo 2 |
| Attendance validation | student attendance route | `test_duplicate_attendance_and_batch_isolation` | Demo 3 |
| Unique attendance | DB unique constraint + catch | `test_duplicate_attendance_and_batch_isolation` | Demo 3 |
| Approved-only delivery | delivery service | `test_delivery_partial_retry_idempotency` | Demo 4 |
| Partial deterministic delivery | `process(..., retry=False)` | `test_delivery_partial_retry_idempotency` | Demo 5 |
| Retry PENDING/FAILED only | retry route | `test_delivery_partial_retry_idempotency` | Demo 5 |
| SENT idempotency | skip SENT + unique DB row | `test_delivery_partial_retry_idempotency` | Demo 5 |
| Delivery report | `/deliveries` | `test_delivery_partial_retry_idempotency` | Demo 5 |
| Staff report | `/api/staff/report` | `test_staff_report_contains_subject_and_teacher` | Dashboard |
| JWT + hashed passwords | security module | auth tests | Login |
| Docker | `docker-compose.yml` | build/start check | Run stack |
| API docs | FastAPI `/docs`, `/redoc` | startup check | Open docs |