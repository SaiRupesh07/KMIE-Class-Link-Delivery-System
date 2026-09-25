from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Session as ClassSession, SessionStatus, Student, Attendance
from app.models.attendance import AttendanceStatus
from app.schemas.session import SessionOut
from app.schemas.attendance import AttendanceCreate, AttendanceOut
from app.core.security import get_current_student
from app.models.user import User
router=APIRouter(prefix="/api/student",tags=["Student"])
@router.get("/sessions",response_model=list[SessionOut])
def my_sessions(db:Session=Depends(get_db),user:User=Depends(get_current_student)):
    student=db.get(Student,user.student_id)
    return db.scalars(select(ClassSession).where(ClassSession.batch_id==student.batch_id,ClassSession.status==SessionStatus.APPROVED).order_by(ClassSession.date,ClassSession.time)).all()
@router.post("/sessions/{session_id}/attendance",response_model=AttendanceOut,status_code=201)
def attendance(session_id:str,data:AttendanceCreate,db:Session=Depends(get_db),user:User=Depends(get_current_student)):
    student=db.get(Student,data.student_id)
    if not student: raise HTTPException(404,"Student not found")
    session=db.get(ClassSession,session_id)
    if not session: raise HTTPException(404,"Session not found")
    auth_student=db.get(Student,user.student_id)
    if data.student_id != user.student_id: raise HTTPException(403,"You can only submit your own attendance.")
    if student.batch_id != session.batch_id or student.batch_id != auth_student.batch_id: raise HTTPException(403,"Student does not belong to this session's batch.")
    if session.status != SessionStatus.APPROVED: raise HTTPException(403,"Attendance is available only for approved sessions.")
    if db.scalar(select(Attendance).where(Attendance.student_id==student.id,Attendance.session_id==session_id)): raise HTTPException(409,"Attendance already submitted.")
    row=Attendance(id=str(uuid4()),student_id=student.id,session_id=session_id,status=data.status)
    db.add(row)
    try: db.commit()
    except IntegrityError: db.rollback(); raise HTTPException(409,"Attendance already submitted.")
    db.refresh(row); return row
