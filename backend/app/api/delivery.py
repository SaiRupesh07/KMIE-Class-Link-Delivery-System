from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Session as ClassSession, SessionStatus, Student, LinkDelivery, DeliveryStatus
from app.core.security import get_current_staff
from app.models.user import User
from app.schemas.delivery import DeliveryReport
router=APIRouter(prefix="/api/sessions",tags=["Delivery"])
def report(session_id,db):
    rows=db.scalars(select(LinkDelivery).where(LinkDelivery.session_id==session_id).order_by(LinkDelivery.student_id)).all()
    students={s.id:s for s in db.scalars(select(Student).where(Student.id.in_([r.student_id for r in rows]))).all()}
    counts={x:sum(r.status.value==x for r in rows) for x in ["SENT","FAILED","PENDING"]}
    return {"session_id":session_id,"sent":counts["SENT"],"failed":counts["FAILED"],"pending":counts["PENDING"],"recipients":[{"student_id":r.student_id,"student_name":students[r.student_id].name,"status":r.status,"attempt_count":r.attempt_count} for r in rows]}
def ensure_rows(session,db):
    students=db.scalars(select(Student).where(Student.batch_id==session.batch_id).order_by(Student.id)).all()
    existing={r.student_id:r for r in db.scalars(select(LinkDelivery).where(LinkDelivery.session_id==session.id)).all()}
    for s in students:
        if s.id not in existing: db.add(LinkDelivery(id=str(uuid4()),student_id=s.id,session_id=session.id,status=DeliveryStatus.PENDING))
    db.flush()
    return db.scalars(select(LinkDelivery).where(LinkDelivery.session_id==session.id).order_by(LinkDelivery.student_id)).all()
def process(session,db,retry=False):
    rows=ensure_rows(session,db)
    successes=0
    for row in rows:
        if row.status==DeliveryStatus.SENT: continue
        if not retry and successes>=2: break
        if row.status not in (DeliveryStatus.PENDING,DeliveryStatus.FAILED): continue
        now=datetime.now(timezone.utc); row.status=DeliveryStatus.SENT; row.attempt_count+=1; row.last_attempt_at=now; row.sent_at=now; successes+=1
    db.commit()
    return report(session.id,db)
@router.post("/{session_id}/deliver",response_model=DeliveryReport)
def deliver(session_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    session=db.get(ClassSession,session_id)
    if not session: raise HTTPException(404,"Session not found")
    if session.status!=SessionStatus.APPROVED: raise HTTPException(409,"Only approved sessions can be delivered.")
    return process(session,db,False)
@router.post("/{session_id}/retry-delivery",response_model=DeliveryReport)
def retry(session_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    session=db.get(ClassSession,session_id)
    if not session: raise HTTPException(404,"Session not found")
    if session.status!=SessionStatus.APPROVED: raise HTTPException(409,"Only approved sessions can be delivered.")
    return process(session,db,True)
@router.get("/{session_id}/deliveries",response_model=DeliveryReport)
def deliveries(session_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    if not db.get(ClassSession,session_id): raise HTTPException(404,"Session not found")
    return report(session_id,db)
