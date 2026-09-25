from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Batch, Session as ClassSession, SessionStatus, Student, User, Role
from app.schemas.session import SessionCreate, SessionUpdate, SessionOut
from app.core.security import get_current_staff, get_current_reviewer, get_current_user
router=APIRouter(prefix="/api/sessions",tags=["Sessions"])
@router.post("",response_model=SessionOut,status_code=201)
def create_session(data:SessionCreate, db:Session=Depends(get_db), user:User=Depends(get_current_staff)):
    if not db.get(Batch,data.batch_id): raise HTTPException(404,"Batch not found")
    obj=ClassSession(id=str(uuid4()),batch_id=data.batch_id,date=data.date,type=data.type,time=data.time,zoom_url=str(data.zoom_url),subject_name=data.subject_name,teacher_name=data.teacher_name,status=SessionStatus.DRAFT,created_by=user.id)
    db.add(obj)
    try: db.commit()
    except IntegrityError: db.rollback(); raise HTTPException(409,"A session of this type already exists for this batch and date.")
    db.refresh(obj); return obj
@router.get("",response_model=list[SessionOut])
def list_sessions(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    if user.role not in (Role.STAFF, Role.REVIEWER): raise HTTPException(403,"Staff or reviewer access required")
    return db.scalars(select(ClassSession).order_by(ClassSession.date,ClassSession.time)).all()
@router.put("/{session_id}",response_model=SessionOut)
def update_session(session_id:str,data:SessionUpdate,db:Session=Depends(get_db),user:User=Depends(get_current_staff)):
    obj=db.get(ClassSession,session_id)
    if not obj: raise HTTPException(404,"Session not found")
    changes=data.model_dump(exclude_unset=True)
    meaningful=bool(changes)
    if "batch_id" in changes and not db.get(Batch,changes["batch_id"]): raise HTTPException(404,"Batch not found")
    for k,v in changes.items(): setattr(obj,k,str(v) if k=="zoom_url" else v)
    if meaningful:
        obj.status=SessionStatus.DRAFT; obj.approved_by=None; obj.approved_at=None
    try: db.commit()
    except IntegrityError: db.rollback(); raise HTTPException(409,"A session of this type already exists for this batch and date.")
    db.refresh(obj); return obj
@router.post("/{session_id}/approve",response_model=SessionOut)
def approve(session_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_reviewer)):
    obj=db.get(ClassSession,session_id)
    if not obj: raise HTTPException(404,"Session not found")
    obj.status=SessionStatus.APPROVED; obj.approved_by=user.id; obj.approved_at=datetime.now(timezone.utc)
    db.commit(); db.refresh(obj); return obj