const API=import.meta.env.VITE_API_URL||'http://localhost:8000';

export async function api(path:string,opts:RequestInit={}){
  const token=localStorage.getItem('token');
  const headers=new Headers(opts.headers);
  headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);

  let r:Response;
  try{
    r=await fetch(API+path,{...opts,headers});
  }catch{
    throw new Error('Network error. Please check your connection and try again.');
  }

  if(r.status===401){
    // Token missing/expired/invalid — the session is no longer valid anywhere
    // in the app, so clear it centrally and send the user back to login
    // rather than letting every screen handle this individually.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    const isLoginRequest=path.startsWith('/api/auth/login');
    if(!isLoginRequest){
      window.location.reload();
    }
    let d:any={};
    try{d=await r.json()}catch{}
    throw new Error(isLoginRequest ? (d.detail||'Invalid email or password') : 'Your session has expired. Please sign in again.');
  }

  if(!r.ok){
    let d:any={};
    try{d=await r.json()}catch{}
    throw new Error(d.detail||`Request failed (${r.status})`);
  }

  return r.status===204?null:r.json();
}

export function login(email:string,password:string){
  return api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
}

/* =========================================================
   STAFF ATTENDANCE MANAGEMENT
   GET  /api/staff/sessions/{session_id}/attendance
   PUT  /api/staff/sessions/{session_id}/attendance/{student_id}
========================================================= */

/** PRESENT | ABSENT | null (not yet marked). */
export type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | null;

export type StaffAttendanceStudent = {
  student_id: string;
  name: string;
  email: string;
  batch: string;
  status: AttendanceStatusValue;
};

export type StaffAttendanceSessionInfo = {
  id: string;
  subject_name: string;
  teacher_name: string;
  date: string;
  time: string;
  type: string;
  status: string;
};

export type StaffAttendanceBatchInfo = {
  id: string;
  name: string;
};

export type StaffSessionAttendance = {
  session: StaffAttendanceSessionInfo;
  batch: StaffAttendanceBatchInfo;
  enrolled_count: number;
  present_count: number;
  absent_count: number;
  not_marked_count: number;
  students: StaffAttendanceStudent[];
};

/** Full attendance roster (session + batch info, live counts, full student list)
 *  for a single session, used by the Staff Attendance Management screen. */
export function getStaffSessionAttendance(sessionId: string) {
  return api(`/api/staff/sessions/${sessionId}/attendance`) as Promise<StaffSessionAttendance>;
}

/** Marks/updates one student's attendance for a session. Returns the
 *  updated student row so the UI can apply the server's own result
 *  instead of assuming the requested status was accepted verbatim. */
export function updateStaffStudentAttendance(
  sessionId: string,
  studentId: string,
  status: 'PRESENT' | 'ABSENT'
) {
  return api(`/api/staff/sessions/${sessionId}/attendance/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }) as Promise<StaffAttendanceStudent>;
}