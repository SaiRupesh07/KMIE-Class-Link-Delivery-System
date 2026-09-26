from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_staff
from app.db.session import get_db
from app.models import (
    Attendance,
    AttendanceStatus,
    Batch,
    Session as ClassSession,
    SessionStatus,
    Student,
    User,
)
from app.schemas.attendance import (
    StaffAttendanceResponse,
    StaffAttendanceStudent,
    StaffAttendanceUpdate,
)

router = APIRouter(prefix="/api/staff", tags=["Staff Attendance"])


def _build_roster(session: ClassSession, db: Session) -> StaffAttendanceResponse:
    batch = db.get(Batch, session.batch_id)

    students = db.scalars(
        select(Student)
        .where(Student.batch_id == session.batch_id)
        .order_by(Student.name)
    ).all()

    attendance_rows = db.scalars(
        select(Attendance).where(Attendance.session_id == session.id)
    ).all()
    attendance_by_student = {row.student_id: row.status for row in attendance_rows}

    roster: list[StaffAttendanceStudent] = []
    present_count = 0
    absent_count = 0
    not_marked_count = 0

    for student in students:
        current_status = attendance_by_student.get(student.id)

        if current_status == AttendanceStatus.PRESENT:
            present_count += 1
        elif current_status == AttendanceStatus.ABSENT:
            absent_count += 1
        else:
            not_marked_count += 1

        roster.append(
            StaffAttendanceStudent(
                student_id=student.id,
                name=student.name,
                email=student.email,
                batch_id=student.batch_id,
                batch_name=batch.name,
                attendance_status=current_status,
            )
        )

    return StaffAttendanceResponse(
        session_id=session.id,
        batch_id=session.batch_id,
        batch_name=batch.name,
        subject_name=session.subject_name,
        teacher_name=session.teacher_name,
        date=session.date,
        time=session.time,
        type=session.type.value,
        session_status=session.status.value,
        enrolled_count=len(students),
        present_count=present_count,
        absent_count=absent_count,
        not_marked_count=not_marked_count,
        students=roster,
    )


@router.get(
    "/sessions/{session_id}/attendance",
    response_model=StaffAttendanceResponse,
    summary="View complete attendance roster for a session. Staff only.",
)
def get_attendance_roster(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_staff),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    return _build_roster(session, db)


@router.put(
    "/sessions/{session_id}/attendance/{student_id}",
    response_model=StaffAttendanceStudent,
    summary="Create or update attendance for a student. Staff only.",
)
def upsert_attendance(
    session_id: str,
    student_id: str,
    data: StaffAttendanceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_staff),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(404, "Student not found")

    # Cross-batch security: the backend, not the frontend, is authoritative here.
    if student.batch_id != session.batch_id:
        raise HTTPException(403, "Student does not belong to this session's batch.")

    # Consistent with the existing student-attendance rule: attendance is
    # only meaningful once a session has been approved.
    if session.status != SessionStatus.APPROVED:
        raise HTTPException(409, "Attendance is available only for approved sessions.")

    row = db.scalar(
        select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.session_id == session_id,
        )
    )

    if row:
        row.status = data.status
    else:
        row = Attendance(
            id=str(uuid4()),
            student_id=student_id,
            session_id=session_id,
            status=data.status,
        )
        db.add(row)

    db.commit()
    db.refresh(row)

    batch = db.get(Batch, student.batch_id)

    return StaffAttendanceStudent(
        student_id=student.id,
        name=student.name,
        email=student.email,
        batch_id=student.batch_id,
        batch_name=batch.name,
        attendance_status=row.status,
    )