from pydantic import BaseModel, EmailStr
class LoginRequest(BaseModel): email: EmailStr; password: str
class UserOut(BaseModel): id:str; name:str; role:str; student_id:str|None=None
class TokenResponse(BaseModel): access_token:str; token_type:str; user:UserOut
