from datetime import date as Date, time as Time

from pydantic import BaseModel

from app.models.attendance import AttendanceStatus


class AttendanceCreate(BaseModel): student_id:str; status:AttendanceStatus
class AttendanceOut(BaseModel): id:str; student_id:str; session_id:str; status:AttendanceStatus


# ---------------------------------------------------------
# Staff attendance management (roster view + mark/update)
# ---------------------------------------------------------

class StaffAttendanceStudent(BaseModel):
    student_id: str
    name: str
    email: str
    batch_id: str
    batch_name: str
    # None means the student's attendance has not been marked yet
    # for this session (no Attendance row exists).
    attendance_status: AttendanceStatus | None = None


class StaffAttendanceResponse(BaseModel):
    session_id: str
    batch_id: str
    batch_name: str
    subject_name: str
    teacher_name: str
    date: Date
    time: Time
    type: str
    session_status: str
    enrolled_count: int
    present_count: int
    absent_count: int
    not_marked_count: int
    students: list[StaffAttendanceStudent]


class StaffAttendanceUpdate(BaseModel):
    status: AttendanceStatus