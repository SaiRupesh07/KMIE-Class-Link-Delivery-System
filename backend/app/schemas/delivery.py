from pydantic import BaseModel
from app.models.delivery import DeliveryStatus
class RecipientOut(BaseModel): student_id:str; student_name:str; status:DeliveryStatus; attempt_count:int
class DeliveryReport(BaseModel): session_id:str; sent:int; failed:int; pending:int; recipients:list[RecipientOut]
