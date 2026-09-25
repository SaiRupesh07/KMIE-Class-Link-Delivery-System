from datetime import date, time, datetime
from pydantic import BaseModel
class DeliveryCounts(BaseModel): sent:int; failed:int; pending:int
class ReportSession(BaseModel):
    id:str; type:str; date:date; time:time; status:str; approved_by:str|None; approved_at:datetime|None; enrolled_student_count:int; attendance_count:int; delivery:DeliveryCounts
class StaffReport(BaseModel): batch:str; date:date; sessions:list[ReportSession]
