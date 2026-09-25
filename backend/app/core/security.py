from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User, Role


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

# JWT authentication scheme.
# Swagger will now expect a Bearer token instead of
# trying to call the JSON login endpoint as OAuth2 password flow.
bearer_scheme = HTTPBearer()

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    return jwt.encode(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "exp": expire,
        },
        settings.jwt_secret_key,
        algorithm=ALGORITHM,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[ALGORITHM],
        )

        user_id = payload.get("sub")

        if not user_id:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = db.get(User, user_id)

    if not user:
        raise credentials_exception

    return user


def require_role(role: Role):
    def dep(user: User = Depends(get_current_user)):
        if user.role != role:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission for this action.",
            )

        return user

    return dep


def get_current_staff(
    user: User = Depends(get_current_user),
) -> User:

    if user.role != Role.STAFF:
        raise HTTPException(
            status_code=403,
            detail="Staff access required",
        )

    return user


def get_current_reviewer(
    user: User = Depends(get_current_user),
) -> User:

    if user.role != Role.REVIEWER:
        raise HTTPException(
            status_code=403,
            detail="Reviewer access required",
        )

    return user


def get_current_student(
    user: User = Depends(get_current_user),
) -> User:

    if user.role != Role.STUDENT or user.student_id is None:
        raise HTTPException(
            status_code=403,
            detail="Student access required",
        )

    return user