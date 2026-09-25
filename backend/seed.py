from uuid import uuid4
from datetime import date, time
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models import Batch, Student, User, Role, Session as ClassSession, SessionType, SessionStatus
from app.core.security import hash_password

def upsert(db, model, where, values):
    obj=db.scalar(select(model).filter_by(**where))
    if not obj:
        obj=model(**values); db.add(obj); db.flush()
    return obj

def main():
    db=SessionLocal()
    try:
        a=upsert(db,Batch,{"name":"BATCH-A"},{"id":"batch-a","name":"BATCH-A"})
        b=upsert(db,Batch,{"name":"BATCH-B"},{"id":"batch-b","name":"BATCH-B"})
        people=[("Rahul","rahul@example.com",a),("Priya","priya@example.com",a),("Arjun","arjun@example.com",a),("Neha","neha@example.com",b),("Kiran","kiran@example.com",b),("Aman","aman@example.com",b)]
        for name,email,batch in people:
            st=upsert(db,Student,{"email":email},{"id":str(uuid4()),"name":name,"email":email,"batch_id":batch.id})
            upsert(db,User,{"email":email},{"id":str(uuid4()),"name":name,"email":email,"password_hash":hash_password("Student@123"),"role":Role.STUDENT,"student_id":st.id})
        upsert(db,User,{"email":"staff@example.com"},{"id":str(uuid4()),"name":"KMIE Staff","email":"staff@example.com","password_hash":hash_password("Staff@123"),"role":Role.STAFF})
        upsert(db,User,{"email":"reviewer@example.com"},{"id":str(uuid4()),"name":"KMIE Reviewer","email":"reviewer@example.com","password_hash":hash_password("Reviewer@123"),"role":Role.REVIEWER})
        staff=db.scalar(select(User).where(User.email=="staff@example.com"))
        live_session=upsert(db,ClassSession,{"batch_id":a.id,"date":date(2026,9,25),"type":SessionType.LIVE},{"id":str(uuid4()),"batch_id":a.id,"date":date(2026,9,25),"type":SessionType.LIVE,"time":time(9,0),"zoom_url":"https://zoom.example.com/chemistry-live","subject_name":"Chemistry","teacher_name":"Dr. Ravi Kumar","status":SessionStatus.DRAFT,"created_by":staff.id})
        recorded_session=upsert(db,ClassSession,{"batch_id":a.id,"date":date(2026,9,25),"type":SessionType.RECORDED},{"id":str(uuid4()),"batch_id":a.id,"date":date(2026,9,25),"type":SessionType.RECORDED,"time":time(18,0),"zoom_url":"https://zoom.example.com/chemistry-recorded","subject_name":"Chemistry","teacher_name":"Dr. Ravi Kumar","status":SessionStatus.DRAFT,"created_by":staff.id})
        # If these sessions already existed from a run before subject_name/teacher_name
        # existed, make sure they get populated with the demo values too.
        live_session.subject_name="Chemistry"; live_session.teacher_name="Dr. Ravi Kumar"
        recorded_session.subject_name="Chemistry"; recorded_session.teacher_name="Dr. Ravi Kumar"
        db.commit(); print("Seed complete")
    finally: db.close()
if __name__=="__main__": main()