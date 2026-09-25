from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Batch, Session as ClassSession, Student, Attendance, LinkDelivery
from app.core.security import get_current_staff
from app.models.user import User
router=APIRouter(prefix="/api/staff",tags=["Reports"])
@router.get("/report")
def report(batch_id:str,date:date,db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    batch=db.get(Batch,batch_id)
    if not batch: raise HTTPException(404,"Batch not found")
    sessions=db.scalars(select(ClassSession).where(ClassSession.batch_id==batch_id,ClassSession.date==date).order_by(ClassSession.time)).all()
    enrolled=db.scalar(select(func.count(Student.id)).where(Student.batch_id==batch_id)) or 0
    result=[]
    for s in sessions:
        attendance=db.scalar(select(func.count(Attendance.id)).where(Attendance.session_id==s.id)) or 0
        sent=db.scalar(select(func.count(LinkDelivery.id)).where(LinkDelivery.session_id==s.id,LinkDelivery.status=="SENT")) or 0
        failed=db.scalar(select(func.count(LinkDelivery.id)).where(LinkDelivery.session_id==s.id,LinkDelivery.status=="FAILED")) or 0
        pending=db.scalar(select(func.count(LinkDelivery.id)).where(LinkDelivery.session_id==s.id,LinkDelivery.status=="PENDING")) or 0
        result.append({"id":s.id,"subject_name":s.subject_name,"teacher_name":s.teacher_name,"type":s.type.value,"date":s.date,"time":s.time,"status":s.status.value,"approved_by":s.approved_by,"approved_at":s.approved_at,"enrolled_student_count":enrolled,"attendance_count":attendance,"delivery":{"sent":sent,"failed":failed,"pending":pending}})
    return {"batch":batch.name,"date":date,"sessions":result}
@router.get("/batches")
def batches(db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    return [{"id":b.id,"name":b.name} for b in db.scalars(select(Batch).order_by(Batch.name)).all()]