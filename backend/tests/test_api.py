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