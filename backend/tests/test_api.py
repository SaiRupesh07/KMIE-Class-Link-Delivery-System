import os

from fastapi.testclient import TestClient

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/kmie_test"
)

from app.main import app

client = TestClient(app)


def login(email, password):
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": password
        }
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth(token):
    return {
        "Authorization": f"Bearer {token}"
    }


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_duplicate_attendance_and_batch_isolation():
    # ---------------------------------------------------------
    # 1. STAFF creates a new session for BATCH-A
    # ---------------------------------------------------------
    staff_token = login(
        "staff@example.com",
        "Staff@123"
    )

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-09-26",
            "type": "LIVE",
            "time": "10:00:00",
            "zoom_url": "https://zoom.example.com/test-live",
            "subject_name": "Chemistry",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )

    assert create_response.status_code == 201

    session = create_response.json()
    session_id = session["id"]

    assert session["status"] == "DRAFT"

    # ---------------------------------------------------------
    # 2. REVIEWER approves the session
    # ---------------------------------------------------------
    reviewer_token = login(
        "reviewer@example.com",
        "Reviewer@123"
    )

    approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "APPROVED"

    # ---------------------------------------------------------
    # 3. Rahul belongs to BATCH-A and should see the session
    # ---------------------------------------------------------
    rahul_token = login(
        "rahul@example.com",
        "Student@123"
    )

    rahul_headers = auth(rahul_token)

    sessions_response = client.get(
        "/api/student/sessions",
        headers=rahul_headers
    )

    assert sessions_response.status_code == 200

    sessions = sessions_response.json()

    assert any(
        session["id"] == session_id
        and session["status"] == "APPROVED"
        for session in sessions
    )

    # Get Rahul's student_id from his login response
    rahul_login = client.post(
        "/api/auth/login",
        json={
            "email": "rahul@example.com",
            "password": "Student@123"
        }
    )

    assert rahul_login.status_code == 200

    rahul_student_id = rahul_login.json()["user"]["student_id"]

    # ---------------------------------------------------------
    # 4. Rahul submits attendance
    # ---------------------------------------------------------
    attendance_response = client.post(
        f"/api/student/sessions/{session_id}/attendance",
        headers=rahul_headers,
        json={
            "student_id": rahul_student_id,
            "status": "PRESENT"
        }
    )

    assert attendance_response.status_code == 201

    # ---------------------------------------------------------
    # 5. Duplicate attendance must return 409
    # ---------------------------------------------------------
    duplicate_response = client.post(
        f"/api/student/sessions/{session_id}/attendance",
        headers=rahul_headers,
        json={
            "student_id": rahul_student_id,
            "status": "PRESENT"
        }
    )

    assert duplicate_response.status_code == 409

    # ---------------------------------------------------------
    # 6. Rahul cannot submit attendance for another student
    # ---------------------------------------------------------
    another_student_response = client.post(
        f"/api/student/sessions/{session_id}/attendance",
        headers=rahul_headers,
        json={
            "student_id": "definitely-not-rahul",
            "status": "PRESENT"
        }
    )

    assert another_student_response.status_code in (403, 404)

    # ---------------------------------------------------------
    # 7. Batch isolation:
    #    Neha belongs to BATCH-B and must NOT see
    #    Rahul's BATCH-A session.
    # ---------------------------------------------------------
    neha_token = login(
        "neha@example.com",
        "Student@123"
    )

    neha_response = client.get(
        "/api/student/sessions",
        headers=auth(neha_token)
    )

    assert neha_response.status_code == 200

    neha_sessions = neha_response.json()

    assert all(
        session["id"] != session_id
        for session in neha_sessions
    )

    # ---------------------------------------------------------
    # 8. Batch isolation on WRITE, not just read:
    #    Neha (BATCH-B) must not be able to submit attendance
    #    against Rahul's BATCH-A session, even using her own
    #    student_id, and no attendance row must be created for it.
    # ---------------------------------------------------------
    neha_login = client.post(
        "/api/auth/login",
        json={
            "email": "neha@example.com",
            "password": "Student@123"
        }
    )

    assert neha_login.status_code == 200

    neha_student_id = neha_login.json()["user"]["student_id"]

    neha_attendance_response = client.post(
        f"/api/student/sessions/{session_id}/attendance",
        headers=auth(neha_token),
        json={
            "student_id": neha_student_id,
            "status": "PRESENT"
        }
    )

    assert neha_attendance_response.status_code == 403

    # Confirm no attendance row was created for the cross-batch attempt:
    # the session's attendance_count must still be exactly 1 (Rahul's).
    report_response = client.get(
        "/api/staff/report",
        headers=auth(staff_token),
        params={"batch_id": "batch-a", "date": "2026-09-26"}
    )

    assert report_response.status_code == 200

    report_session = next(
        s for s in report_response.json()["sessions"] if s["id"] == session_id
    )

    assert report_session["attendance_count"] == 1


def test_student_cannot_approve_or_deliver():
    token = login(
        "rahul@example.com",
        "Student@123"
    )

    response = client.get(
        "/api/sessions",
        headers=auth(token)
    )

    assert response.status_code == 403


def test_staff_cannot_approve():
    staff_token = login(
        "staff@example.com",
        "Staff@123"
    )

    response = client.get(
        "/api/sessions",
        headers=auth(staff_token)
    )

    assert response.status_code == 200

    sessions = response.json()

    if sessions:
        approve_response = client.post(
            f"/api/sessions/{sessions[0]['id']}/approve",
            headers=auth(staff_token)
        )

        assert approve_response.status_code == 403


# ---------------------------------------------------------
# Subject Name / Teacher Name feature tests
# ---------------------------------------------------------

def test_create_session_with_subject_and_teacher():
    # TEST 1 + TEST 2:
    # Staff can create a session with subject_name/teacher_name (201),
    # and both GET /api/sessions and the create response contain them.
    staff_token = login("staff@example.com", "Staff@123")

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-01",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/physics-live",
            "subject_name": "Physics",
            "teacher_name": "Dr. Kumar"
        }
    )

    assert create_response.status_code == 201

    created = create_response.json()
    assert created["subject_name"] == "Physics"
    assert created["teacher_name"] == "Dr. Kumar"

    session_id = created["id"]

    list_response = client.get("/api/sessions", headers=auth(staff_token))
    assert list_response.status_code == 200

    listed = next(s for s in list_response.json() if s["id"] == session_id)
    assert listed["subject_name"] == "Physics"
    assert listed["teacher_name"] == "Dr. Kumar"


def test_editing_subject_or_teacher_invalidates_approval_and_can_be_reapproved():
    # TEST 3, 4, 5, 6, 7:
    # Staff can edit subject_name/teacher_name; editing either field on an
    # APPROVED session resets it to DRAFT (approved_by/approved_at cleared);
    # the Reviewer can then approve it again.
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-02",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/physics-edit",
            "subject_name": "Physics",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "APPROVED"

    # Edit subject_name -> must drop back to DRAFT.
    edit_subject_response = client.put(
        f"/api/sessions/{session_id}",
        headers=auth(staff_token),
        json={"subject_name": "Advanced Physics"}
    )
    assert edit_subject_response.status_code == 200
    edited = edit_subject_response.json()
    assert edited["subject_name"] == "Advanced Physics"
    assert edited["status"] == "DRAFT"
    assert edited["approved_by"] is None
    assert edited["approved_at"] is None

    # Re-approve, then edit teacher_name -> must drop back to DRAFT again.
    reapprove_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert reapprove_response.status_code == 200
    assert reapprove_response.json()["status"] == "APPROVED"

    edit_teacher_response = client.put(
        f"/api/sessions/{session_id}",
        headers=auth(staff_token),
        json={"teacher_name": "Dr. S. Kumar"}
    )
    assert edit_teacher_response.status_code == 200
    edited_teacher = edit_teacher_response.json()
    assert edited_teacher["teacher_name"] == "Dr. S. Kumar"
    assert edited_teacher["status"] == "DRAFT"
    assert edited_teacher["approved_by"] is None
    assert edited_teacher["approved_at"] is None

    # Reviewer can approve the edited session again.
    final_approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert final_approve_response.status_code == 200
    assert final_approve_response.json()["status"] == "APPROVED"


def test_student_sees_subject_and_teacher_within_own_batch_only():
    # TEST 8 + TEST 9:
    # An approved session's subject_name/teacher_name are visible to a
    # student in that batch, and batch isolation still holds.
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-03",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/physics-student",
            "subject_name": "Physics",
            "teacher_name": "Dr. S. Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert approve_response.status_code == 200

    rahul_token = login("rahul@example.com", "Student@123")
    rahul_sessions = client.get(
        "/api/student/sessions",
        headers=auth(rahul_token)
    )
    assert rahul_sessions.status_code == 200

    rahul_match = next(
        s for s in rahul_sessions.json() if s["id"] == session_id
    )
    assert rahul_match["subject_name"] == "Physics"
    assert rahul_match["teacher_name"] == "Dr. S. Kumar"

    neha_token = login("neha@example.com", "Student@123")
    neha_sessions = client.get(
        "/api/student/sessions",
        headers=auth(neha_token)
    )
    assert neha_sessions.status_code == 200
    assert all(s["id"] != session_id for s in neha_sessions.json())


def test_staff_report_contains_subject_and_teacher():
    # TEST 10:
    # GET /api/staff/report continues returning enrolled/attendance/delivery
    # counts, and now also includes subject_name/teacher_name per session.
    staff_token = login("staff@example.com", "Staff@123")

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-04",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/physics-report",
            "subject_name": "Physics",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    report_response = client.get(
        "/api/staff/report",
        headers=auth(staff_token),
        params={"batch_id": "batch-a", "date": "2026-10-04"}
    )
    assert report_response.status_code == 200

    report = report_response.json()
    matching = next(s for s in report["sessions"] if s["id"] == session_id)

    assert matching["subject_name"] == "Physics"
    assert matching["teacher_name"] == "Dr. Ravi Kumar"
    assert "enrolled_student_count" in matching
    assert "attendance_count" in matching
    assert "delivery" in matching
    assert set(matching["delivery"].keys()) == {"sent", "failed", "pending"}


def test_delivery_partial_retry_idempotency():
    # Proves the full delivery lifecycle end-to-end:
    #   - DRAFT sessions cannot be delivered (409)
    #   - initial delivery sends exactly 2 of 3 eligible recipients,
    #     the 3rd stays PENDING
    #   - retry-delivery resumes only the remaining recipient(s)
    #   - already-SENT recipients are never resent (no duplicate
    #     LinkDelivery rows, attempt_count unchanged)
    #   - a second retry is a true no-op (idempotent)
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")

    # 3. Create a new BATCH-A session on a date that doesn't collide
    # with any other seeded/test session.
    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-05",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/delivery-retry-test",
            "subject_name": "Physics",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    # 4. Confirm it is DRAFT.
    assert create_response.json()["status"] == "DRAFT"

    # 5-6. Delivery before approval must be rejected.
    early_deliver_response = client.post(
        f"/api/sessions/{session_id}/deliver",
        headers=auth(staff_token)
    )
    assert early_deliver_response.status_code == 409

    # 7. Reviewer approves the session.
    approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "APPROVED"

    # 8-9. Initial delivery: 2 SENT, 1 PENDING, 0 FAILED, 3 recipients.
    deliver_response = client.post(
        f"/api/sessions/{session_id}/deliver",
        headers=auth(staff_token)
    )
    assert deliver_response.status_code == 200

    first = deliver_response.json()
    assert first["sent"] == 2
    assert first["pending"] == 1
    assert first["failed"] == 0
    assert len(first["recipients"]) == 3

    # 10-11. The 2 SENT recipients have attempt_count == 1; the
    # remaining recipient is PENDING with attempt_count == 0.
    sent_after_first = [r for r in first["recipients"] if r["status"] == "SENT"]
    pending_after_first = [r for r in first["recipients"] if r["status"] == "PENDING"]

    assert len(sent_after_first) == 2
    assert len(pending_after_first) == 1
    assert all(r["attempt_count"] == 1 for r in sent_after_first)
    assert pending_after_first[0]["attempt_count"] == 0

    sent_student_ids_after_first = {r["student_id"] for r in sent_after_first}

    # 12-13. Retry: all 3 now SENT, 0 pending, 0 failed.
    retry_response = client.post(
        f"/api/sessions/{session_id}/retry-delivery",
        headers=auth(staff_token)
    )
    assert retry_response.status_code == 200

    second = retry_response.json()
    assert second["sent"] == 3
    assert second["pending"] == 0
    assert second["failed"] == 0

    # 14-15. Exactly 3 recipients, no duplicate LinkDelivery rows (unique
    # student_ids), and the 2 originally-SENT recipients were not resent.
    assert len(second["recipients"]) == 3
    student_ids_after_retry = {r["student_id"] for r in second["recipients"]}
    assert len(student_ids_after_retry) == 3

    unchanged_recipients = {
        r["student_id"]: r["attempt_count"] for r in second["recipients"]
        if r["student_id"] in sent_student_ids_after_first
    }
    assert all(count == 1 for count in unchanged_recipients.values())

    # 16. All three recipients now have attempt_count == 1 (each was
    # sent exactly once total, whether on initial delivery or retry).
    assert all(r["attempt_count"] == 1 for r in second["recipients"])

    # 17-18. Retry again: fully idempotent, no state or count changes.
    retry_again_response = client.post(
        f"/api/sessions/{session_id}/retry-delivery",
        headers=auth(staff_token)
    )
    assert retry_again_response.status_code == 200

    third = retry_again_response.json()
    assert third["sent"] == 3
    assert third["pending"] == 0
    assert third["failed"] == 0
    assert len(third["recipients"]) == 3
    assert {r["student_id"] for r in third["recipients"]} == student_ids_after_retry
    assert all(r["attempt_count"] == 1 for r in third["recipients"])

    # 19. GET /deliveries reflects the same final, idempotent state.
    deliveries_response = client.get(
        f"/api/sessions/{session_id}/deliveries",
        headers=auth(staff_token)
    )
    assert deliveries_response.status_code == 200

    final = deliveries_response.json()
    assert final["sent"] == 3
    assert final["pending"] == 0
    assert final["failed"] == 0
    assert len(final["recipients"]) == 3
    assert all(r["attempt_count"] == 1 for r in final["recipients"])

# ---------------------------------------------------------
# Staff attendance management (roster view + mark/update)
# ---------------------------------------------------------

def get_student_id(email, password):
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password}
    )
    assert response.status_code == 200
    return response.json()["user"]["student_id"]


def create_and_approve_session(staff_token, reviewer_token, date_str, batch_id="batch-a"):
    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": batch_id,
            "date": date_str,
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": f"https://zoom.example.com/attendance-{date_str}",
            "subject_name": "Chemistry",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    approve_response = client.post(
        f"/api/sessions/{session_id}/approve",
        headers=auth(reviewer_token)
    )
    assert approve_response.status_code == 200

    return session_id


def test_staff_attendance_roster_full_details():
    # TEST 1: Staff can retrieve the complete attendance roster for a
    # session, with correct session/batch info, every enrolled BATCH-A
    # student, correct names/emails, and correct counts before anything
    # has been marked.
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")

    session_id = create_and_approve_session(staff_token, reviewer_token, "2026-10-06")

    roster_response = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    )
    assert roster_response.status_code == 200

    roster = roster_response.json()
    assert roster["session_id"] == session_id
    assert roster["batch_id"] == "batch-a"
    assert roster["batch_name"] == "BATCH-A"
    assert roster["subject_name"] == "Chemistry"
    assert roster["teacher_name"] == "Dr. Ravi Kumar"

    students = roster["students"]
    names = {s["name"] for s in students}
    emails = {s["email"] for s in students}

    assert names == {"Rahul", "Priya", "Arjun"}
    assert emails == {"rahul@example.com", "priya@example.com", "arjun@example.com"}
    assert all(s["batch_id"] == "batch-a" for s in students)
    assert all(s["attendance_status"] is None for s in students)

    assert roster["enrolled_count"] == 3
    assert roster["present_count"] == 0
    assert roster["absent_count"] == 0
    assert roster["not_marked_count"] == 3


def test_staff_can_mark_and_change_attendance():
    # TEST 2 + TEST 3 + TEST 4:
    # Staff can mark PRESENT (row created), mark ABSENT (row updated,
    # not duplicated), and flip PRESENT -> ABSENT -> PRESENT with the
    # roster counts staying consistent throughout (no duplicate rows).
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")
    rahul_id = get_student_id("rahul@example.com", "Student@123")

    session_id = create_and_approve_session(staff_token, reviewer_token, "2026-10-07")

    # Mark PRESENT (creates a new Attendance row).
    mark_present = client.put(
        f"/api/staff/sessions/{session_id}/attendance/{rahul_id}",
        headers=auth(staff_token),
        json={"status": "PRESENT"}
    )
    assert mark_present.status_code == 200
    assert mark_present.json()["attendance_status"] == "PRESENT"

    roster_after_present = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    ).json()
    assert roster_after_present["present_count"] == 1
    assert roster_after_present["absent_count"] == 0
    assert roster_after_present["not_marked_count"] == 2

    # PRESENT -> ABSENT (updates the same row, no duplicate).
    mark_absent = client.put(
        f"/api/staff/sessions/{session_id}/attendance/{rahul_id}",
        headers=auth(staff_token),
        json={"status": "ABSENT"}
    )
    assert mark_absent.status_code == 200
    assert mark_absent.json()["attendance_status"] == "ABSENT"

    roster_after_absent = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    ).json()
    assert roster_after_absent["present_count"] == 0
    assert roster_after_absent["absent_count"] == 1
    assert roster_after_absent["not_marked_count"] == 2

    # ABSENT -> PRESENT again (still one row, not two).
    mark_present_again = client.put(
        f"/api/staff/sessions/{session_id}/attendance/{rahul_id}",
        headers=auth(staff_token),
        json={"status": "PRESENT"}
    )
    assert mark_present_again.status_code == 200
    assert mark_present_again.json()["attendance_status"] == "PRESENT"

    roster_final = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    ).json()
    assert roster_final["present_count"] == 1
    assert roster_final["absent_count"] == 0
    assert roster_final["not_marked_count"] == 2
    assert roster_final["enrolled_count"] == 3


def test_staff_attendance_cross_batch_rejected():
    # TEST 5: A BATCH-A session cannot have attendance marked for a
    # BATCH-B student. Must return 403, and no attendance row/state
    # change results from the attempt.
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")
    neha_id = get_student_id("neha@example.com", "Student@123")

    session_id = create_and_approve_session(staff_token, reviewer_token, "2026-10-08")

    cross_batch_response = client.put(
        f"/api/staff/sessions/{session_id}/attendance/{neha_id}",
        headers=auth(staff_token),
        json={"status": "PRESENT"}
    )
    assert cross_batch_response.status_code == 403

    roster = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    ).json()
    assert roster["not_marked_count"] == 3
    assert all(s["attendance_status"] is None for s in roster["students"])
    assert all(s["student_id"] != neha_id for s in roster["students"])


def test_staff_attendance_endpoints_require_staff_role():
    # TEST 6: Neither a STUDENT nor a REVIEWER token may use the staff
    # attendance endpoints (roster or mark/update).
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")
    student_token = login("rahul@example.com", "Student@123")
    rahul_id = get_student_id("rahul@example.com", "Student@123")

    session_id = create_and_approve_session(staff_token, reviewer_token, "2026-10-09")

    for token in (student_token, reviewer_token):
        roster_response = client.get(
            f"/api/staff/sessions/{session_id}/attendance",
            headers=auth(token)
        )
        assert roster_response.status_code == 403

        update_response = client.put(
            f"/api/staff/sessions/{session_id}/attendance/{rahul_id}",
            headers=auth(token),
            json={"status": "PRESENT"}
        )
        assert update_response.status_code == 403


def test_staff_attendance_draft_session_rejected():
    # TEST 7: Marking attendance on a DRAFT (not yet approved) session
    # must be rejected with 409, and must not create an Attendance row.
    # The roster GET itself still works on a DRAFT session so staff can
    # see who is enrolled before approval.
    staff_token = login("staff@example.com", "Staff@123")
    rahul_id = get_student_id("rahul@example.com", "Student@123")

    create_response = client.post(
        "/api/sessions",
        headers=auth(staff_token),
        json={
            "batch_id": "batch-a",
            "date": "2026-10-10",
            "type": "LIVE",
            "time": "09:00:00",
            "zoom_url": "https://zoom.example.com/attendance-draft",
            "subject_name": "Chemistry",
            "teacher_name": "Dr. Ravi Kumar"
        }
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]
    assert create_response.json()["status"] == "DRAFT"

    draft_update_response = client.put(
        f"/api/staff/sessions/{session_id}/attendance/{rahul_id}",
        headers=auth(staff_token),
        json={"status": "PRESENT"}
    )
    assert draft_update_response.status_code == 409

    roster_response = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    )
    assert roster_response.status_code == 200
    roster = roster_response.json()
    assert roster["session_status"] == "DRAFT"
    assert roster["not_marked_count"] == 3
    assert all(s["attendance_status"] is None for s in roster["students"])


def test_student_attendance_endpoint_still_works():
    # TEST 8: The existing student self-attendance endpoint remains
    # fully functional after adding the staff attendance API.
    staff_token = login("staff@example.com", "Staff@123")
    reviewer_token = login("reviewer@example.com", "Reviewer@123")
    student_token = login("priya@example.com", "Student@123")
    priya_id = get_student_id("priya@example.com", "Student@123")

    session_id = create_and_approve_session(staff_token, reviewer_token, "2026-10-11")

    response = client.post(
        f"/api/student/sessions/{session_id}/attendance",
        headers=auth(student_token),
        json={"student_id": priya_id, "status": "PRESENT"}
    )
    assert response.status_code == 201
    assert response.json()["status"] == "PRESENT"

    # Staff roster reflects the student's own submission too.
    roster = client.get(
        f"/api/staff/sessions/{session_id}/attendance",
        headers=auth(staff_token)
    ).json()
    priya_row = next(s for s in roster["students"] if s["student_id"] == priya_id)
    assert priya_row["attendance_status"] == "PRESENT"