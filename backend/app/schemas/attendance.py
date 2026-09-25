from pydantic import BaseModel
from app.models.attendance import AttendanceStatus
class AttendanceCreate(BaseModel): student_id:str; status:AttendanceStatus
class AttendanceOut(BaseModel): id:str; student_id:str; session_id:str; status:AttendanceStatus
