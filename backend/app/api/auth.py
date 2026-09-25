from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.core.security import verify_password, create_access_token
router=APIRouter(prefix="/api/auth",tags=["Authentication"])
@router.post("/login",response_model=TokenResponse)
def login(data:LoginRequest,db:Session=Depends(get_db)):
    user=db.scalar(select(User).where(User.email==data.email))
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,"Invalid email or password")
    return {"access_token":create_access_token(user),"token_type":"bearer","user":{"id":user.id,"name":user.name,"role":user.role.value,"student_id":user.student_id}}
