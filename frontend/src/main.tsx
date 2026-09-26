import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  api,
  login,
  getStaffSessionAttendance,
  updateStaffStudentAttendance,
  type StaffSessionAttendance,
} from "./lib/api";

type User = {
  id: string;
  name: string;
  role: "STAFF" | "REVIEWER" | "STUDENT";
  student_id?: string | null;
};

type Session = {
  id: string;
  batch_id: string;
  date: string;
  type: string;
  time: string;
  zoom_url: string;
  status: string;
  subject_name: string;
  teacher_name: string;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
};

type Batch = {
  id: string;
  name: string;
  /** Present when the backend includes enrollment data on
   *  GET /api/staff/batches. Optional so older/partial backend
   *  responses never crash the dashboard — see enrolledCountOf(). */
  enrolled_count?: number;
  students?: BatchStudent[];
};

/** One row of the enrolled-students roster embedded in a Batch,
 *  from GET /api/staff/batches. Staff-only — never rendered for
 *  Reviewer or Student. */
type BatchStudent = {
  student_id: string;
  name: string;
  email: string;
};

/** Real shape of GET /api/staff/report?batch_id=...&date=...
 *  The endpoint returns every session for the given batch/date,
 *  not a single flat report — the frontend must pick the session
 *  the user actually clicked "Report" on by matching its id. */
type StaffReportSession = {
  id: string;
  type: string;
  date: string;
  time: string;
  status: string;
  subject_name: string;
  teacher_name: string;
  approved_by: string | null;
  approved_at: string | null;
  enrolled_student_count: number;
  attendance_count: number;
  delivery: {
    sent: number;
    failed: number;
    pending: number;
  };
};

type StaffReportResponse = {
  batch: string;
  date: string;
  sessions: StaffReportSession[];
};

/** Normalized, flat shape the ReportModal actually renders —
 *  derived from the matching session inside StaffReportResponse. */
type StaffReport = {
  enrolled: number;
  attendance: number;
  sent: number;
  failed: number;
  pending: number;
};

/** Shape of GET /api/sessions/{id}/deliveries — the existing,
 *  already-correct Delivery Status endpoint. */
type DeliveryRecipient = {
  student_id: string;
  student_name: string;
  status: string;
  attempt_count: number;
};

type DeliveryReport = {
  session_id: string;
  sent: number;
  failed: number;
  pending: number;
  recipients: DeliveryRecipient[];
};

/* =========================================================
   ICONS (hand-drawn, dependency-free, 24x24 stroke icons)
========================================================= */

type IconProps = { className?: string };

const GraduationCapIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3 1 8l11 5 9-4.1V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 10.5V16c0 1.5 3 3 7 3s7-1.5 7-3v-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ClockIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UsersIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16 5.2c1.6.4 2.8 1.8 2.8 3.5 0 1.6-1.1 3-2.6 3.4M21 20c0-2.9-2-5.1-4.8-5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LayersIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m3 13 9 5 9-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LogOutIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LinkIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M11.5 6.5 13 5a4 4 0 1 1 5.7 5.7l-1.5 1.5M12.5 17.5 11 19a4 4 0 1 1-5.7-5.7l1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RefreshIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 13a8 8 0 0 0 14.9 4m1.1 4v-5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ClipboardListIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="6" y="4" width="12" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 10h6M9 14h6M9 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const EyeIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const EyeOffIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M6.4 6.6C4 8.2 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a15.6 15.6 0 0 1-2.6 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InboxIcon = ({ className = "w-6 h-6" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 13h4.5l1.5 2.5h6L16.5 13H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 13 5 5.5A2 2 0 0 1 7 4h10a2 2 0 0 1 2 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PencilIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const BarChartIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ChevronLeftIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* =========================================================
   SMALL PRESENTATIONAL PRIMITIVES
========================================================= */

function getStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Turns a batch name into a short two-letter tag.
 * "BATCH-A" -> "BA", "BATCH-B" -> "BB" (previously both showed "BA"
 * because a plain slice(0, 2) only ever looked at the first two
 * characters of the string, which are identical for both batches).
 */
function getBatchInitials(name: string): string {
  const parts = name.split(/[\s\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0][0] || "";
    const last = parts[parts.length - 1][0] || "";
    return (first + last).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Maps a raw error (often just "Request failed (409)") to a readable message. */
function friendlyError(err: any): string {
  const msg: string = err?.message || "";
  if (/\(409\)/.test(msg) || /conflict/i.test(msg)) {
    return "A session of this type already exists for this batch and date.";
  }
  if (/\(404\)/.test(msg) || (/batch/i.test(msg) && /not found/i.test(msg))) {
    return "Batch not found.";
  }
  if (/\(401\)/.test(msg) || /\(403\)/.test(msg) || /unauthorized/i.test(msg) || /forbidden/i.test(msg)) {
    return "Staff access required.";
  }
  if (/\(422\)/.test(msg)) {
    return "Please check the form for invalid or missing fields.";
  }
  if (/\(500\)/.test(msg)) {
    return "Something went wrong on the server. Please try again.";
  }
  return msg || "Something went wrong. Please try again.";
}

/** General-purpose HTTP error → human message mapper, used anywhere outside
 *  the session create/edit modal (attendance, approval, delivery actions).
 *  Never surfaces raw stack traces, SQL, or "[object Object]" — always a
 *  short, actionable sentence, and falls back to the backend's own message
 *  when it's already clear (e.g. "Attendance already submitted."). */
function friendlyActionError(
  err: any,
  context?: "attendance" | "approve" | "deliver" | "staffAttendance"
): string {
  const msg: string = err?.message || "";

  if (/\(401\)/.test(msg) || /session has expired/i.test(msg)) {
    return context === "staffAttendance"
      ? "Your session has expired. Please log in again."
      : "Your session has expired. Please sign in again.";
  }
  if (/\(403\)/.test(msg) || /forbidden/i.test(msg)) {
    if (context === "staffAttendance") return "You do not have permission to manage attendance.";
    return context === "attendance"
      ? "You do not have access to this session."
      : "You do not have permission to perform this action.";
  }
  if (/\(404\)/.test(msg) || /not found/i.test(msg)) {
    return context === "staffAttendance"
      ? "Session or student not found."
      : "That record could not be found. It may have been removed.";
  }
  if (/\(409\)/.test(msg) || /already submitted/i.test(msg) || /already recorded/i.test(msg) || /conflict/i.test(msg)) {
    if (context === "staffAttendance") return "Attendance has already been recorded for this student.";
    return context === "attendance"
      ? "Attendance has already been submitted for this session."
      : "This action conflicts with the current state of the session.";
  }
  if (/\(400\)/.test(msg) || /\(422\)/.test(msg)) {
    return context === "staffAttendance"
      ? "Please check the attendance details and try again."
      : "That request was invalid. Please check the details and try again.";
  }
  if (/\(500\)/.test(msg)) {
    return "Something went wrong on the server. Please try again.";
  }
  if (/network error/i.test(msg)) {
    return context === "staffAttendance" ? "Unable to update attendance. Please try again." : msg;
  }
  return msg || "Something went wrong. Please try again.";
}

/** Maps a raw modal-loading error to a safe, readable message.
 *  Never surfaces stack traces / [object Object] / raw exceptions —
 *  falls back to the given generic message unless the API gave a
 *  real `detail` (which the api() helper already threads through). */
function friendlyDetailError(err: any, fallback: string): string {
  const msg: string = err?.message || "";
  if (!msg || /request failed/i.test(msg)) {
    return fallback;
  }
  return msg;
}

/** Turns a Deliver/Retry response into concise, human-readable
 *  feedback instead of dumping raw JSON in the "Latest response"
 *  panel. Safe against missing fields — never throws. */
function formatDeliveryFeedback(prefix: string, data: any): string {
  const sent = Number(data?.sent ?? 0);
  const failed = Number(data?.failed ?? 0);
  const pending = Number(data?.pending ?? 0);
  return `${prefix}: ${sent} sent, ${failed} failed, ${pending} pending.`;
}

/** Safe display helpers for the new Subject/Teacher session fields.
 *  If the backend hasn't been updated yet (Phase 2), these values may
 *  be missing — never assume they exist (e.g. no .toUpperCase() on
 *  a possibly-undefined string). */
function subjectNameOf(session: Pick<Session, "subject_name">): string {
  return session.subject_name || "Untitled Subject";
}

function teacherNameOf(session: Pick<Session, "teacher_name">): string {
  return session.teacher_name || "Teacher not assigned";
}

/** Enrollment must reflect actual Student records on the batch, never
 *  be inferred from sessions/attendance. Falls back through whichever
 *  the backend actually sent: an explicit count, then the students
 *  array length, then 0 — never crashes on a partial response. */
function enrolledCountOf(batch: Batch): number {
  if (typeof batch.enrolled_count === "number") return batch.enrolled_count;
  if (Array.isArray(batch.students)) return batch.students.length;
  return 0;
}

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
    {children}
  </span>
);

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DELIVERED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  PRESENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ABSENT: "bg-rose-50 text-rose-700 ring-rose-600/20",
  NOT_MARKED: "bg-slate-100 text-slate-500 ring-slate-400/30",
};

const StatusPill = ({ status, label }: { status: string; label?: string }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide ring-1 ring-inset ${
      STATUS_STYLES[status] || "bg-slate-100 text-slate-600 ring-slate-600/20"
    }`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {label ?? status}
  </span>
);

function Spinner({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin-slow ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:shadow-md">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <InboxIcon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function MessagePanel({ message, onClear }: { message: string; onClear?: () => void }) {
  if (!message) return null;
  const trimmed = message.trim();
  const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const looksError = /error|failed|fail/i.test(message) && !isJson;

  return (
    <div className="animate-fade-in mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`flex items-center justify-between gap-3 px-5 py-3 ${
          looksError ? "bg-rose-50" : "bg-slate-50"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              looksError ? "bg-rose-100 text-rose-600" : "bg-indigo-100 text-indigo-600"
            }`}
          >
            {looksError ? <XIcon className="h-3.5 w-3.5" /> : <ClipboardListIcon className="h-3.5 w-3.5" />}
          </span>
          <span className="text-sm font-semibold text-slate-700">
            {looksError ? "Something went wrong" : "Latest response"}
          </span>
        </div>
        {onClear && (
          <button
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600"
            onClick={onClear}
            aria-label="Dismiss"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {isJson ? (
        <pre className="max-h-80 overflow-auto bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {message}
        </pre>
      ) : (
        <div className="px-5 py-3 text-sm text-slate-600">{message}</div>
      )}
    </div>
  );
}

function logout() {
  localStorage.clear();
  window.location.reload();
}

/* =========================================================
   LOGIN
========================================================= */

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("staff@example.com");
  const [password, setPassword] = useState("Staff@123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const data = await login(email, password);

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      onLogin(data.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const demoAccounts = [
    { role: "STAFF", email: "staff@example.com", password: "Staff@123" },
    { role: "REVIEWER", email: "reviewer@example.com", password: "Reviewer@123" },
    { role: "STUDENT", email: "rahul@example.com", password: "Student@123" },
  ];

  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="bg-mesh bg-grid relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 animate-float rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-72 w-72 animate-float-slow rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 backdrop-blur">
            <GraduationCapIcon className="h-6 w-6" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">KMIE</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
            Class Link &amp; Delivery,
            <br />
            perfectly orchestrated.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-300">
            One workspace for staff, reviewers and students to schedule, approve
            and deliver every class session — with full visibility at every step.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: <LayersIcon className="h-4 w-4" />, text: "Manage batches and sessions from one dashboard" },
              { icon: <CheckIcon className="h-4 w-4" />, text: "Reviewer approvals before anything goes live" },
              { icon: <UsersIcon className="h-4 w-4" />, text: "Simple attendance tracking for every student" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-300 ring-1 ring-white/10">
                  {item.icon}
                </span>
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} KMIE. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="animate-fade-in w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <GraduationCapIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">KMIE</span>
          </div>

          <form
            className="rounded-3xl border border-slate-200/70 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10"
            onSubmit={handleLogin}
          >
            <div className="mb-8">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h1>
              <p className="mt-2 text-sm text-slate-500">
                Sign in to the Class Link &amp; Delivery Management System.
              </p>
            </div>

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
            <input
              className="mb-5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
            />

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
            <div className="relative mb-6">
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-11 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading && <Spinner className="h-4 w-4" />}
              {loading ? "Signing in..." : "Sign in"}
            </button>

            {error && (
              <p className="animate-fade-in mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Demo credentials
              </p>
              <div className="space-y-2">
                {demoAccounts.map((acc) => (
                  <button
                    type="button"
                    key={acc.role}
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.password);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-indigo-300 hover:bg-indigo-50/50"
                  >
                    <span className="font-semibold text-slate-600">{acc.role}</span>
                    <span className="text-slate-400">{acc.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CREATE / EDIT SESSION MODAL
========================================================= */

type SessionFormValues = {
  batch_id: string;
  date: string;
  type: "LIVE" | "RECORDED";
  time: string;
  zoom_url: string;
  subject_name: string;
  teacher_name: string;
};

const EMPTY_SESSION_FORM: SessionFormValues = {
  batch_id: "",
  date: "",
  type: "LIVE",
  time: "",
  zoom_url: "",
  subject_name: "",
  teacher_name: "",
};

function SessionModal({
  open,
  mode,
  batches,
  initialValues,
  isApprovedEdit,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  batches: Batch[];
  initialValues: SessionFormValues;
  isApprovedEdit?: boolean;
  onClose: () => void;
  onSubmit: (values: SessionFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<SessionFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Reset the form to the caller-provided values every time the modal opens.
  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setFormError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape for keyboard-friendly interaction.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function update<K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedSubject = values.subject_name.trim();
    const trimmedTeacher = values.teacher_name.trim();

    if (
      !values.batch_id ||
      !values.date ||
      !values.type ||
      !values.time ||
      !values.zoom_url ||
      !trimmedSubject ||
      !trimmedTeacher
    ) {
      setFormError("All fields are required.");
      return;
    }

    setFormError("");
    setSubmitting(true);

    try {
      await onSubmit({ ...values, subject_name: trimmedSubject, teacher_name: trimmedTeacher });
    } catch (err: any) {
      // Keep the entered values in place so the user doesn't have to retype.
      setFormError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="animate-fade-in absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="animate-scale-in relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">
            {mode === "create" ? "Create Class Session" : "Edit Class Session"}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {mode === "edit" && isApprovedEdit && (
          <div className="animate-fade-in mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This session is currently <strong>APPROVED</strong>. Saving any change will return it to{" "}
              <strong>DRAFT</strong> and require reviewer approval again before it can be delivered.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-batch">
              Batch
            </label>
            <select
              id="session-batch"
              required
              value={values.batch_id}
              onChange={(e) => update("batch_id", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            >
              <option value="" disabled>
                Select a batch
              </option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-subject">
              Subject Name
            </label>
            <input
              id="session-subject"
              required
              type="text"
              placeholder="Chemistry"
              value={values.subject_name}
              onChange={(e) => update("subject_name", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-teacher">
              Teacher Name
            </label>
            <input
              id="session-teacher"
              required
              type="text"
              placeholder="Dr. Ravi Kumar"
              value={values.teacher_name}
              onChange={(e) => update("teacher_name", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-date">
                Date
              </label>
              <input
                id="session-date"
                required
                type="date"
                value={values.date}
                onChange={(e) => update("date", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-time">
                Time
              </label>
              <input
                id="session-time"
                required
                type="time"
                value={values.time}
                onChange={(e) => update("time", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-type">
              Type
            </label>
            <select
              id="session-type"
              required
              value={values.type}
              onChange={(e) => update("type", e.target.value as SessionFormValues["type"])}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            >
              <option value="LIVE">LIVE</option>
              <option value="RECORDED">RECORDED</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="session-url">
              Zoom URL
            </label>
            <input
              id="session-url"
              required
              type="url"
              placeholder="https://zoom.example.com/class"
              value={values.zoom_url}
              onChange={(e) => update("zoom_url", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          {formError && (
            <p className="animate-fade-in flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                ? "Create Session"
                : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   REPORT MODAL (Staff — Attendance & Delivery)
========================================================= */

function ReportStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`rounded-xl p-4 text-center ring-1 ring-inset ${accent}`}>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function DeliveryStatRow({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "sent" | "failed" | "pending";
  icon: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    sent: "bg-blue-50 text-blue-700 ring-blue-600/20",
    failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
    pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  };

  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 ring-1 ring-inset ${styles[tone]}`}>
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        {icon}
        {label}
      </span>
      <span className="text-lg font-extrabold">{value}</span>
    </div>
  );
}

function ReportDeliverySummary({
  sent,
  failed,
  pending,
}: {
  sent: number;
  failed: number;
  pending: number;
}) {
  return (
    <div className="space-y-2">
      <DeliveryStatRow label="Sent" value={sent} tone="sent" icon={<CheckIcon className="h-3.5 w-3.5" />} />
      <DeliveryStatRow label="Failed" value={failed} tone="failed" icon={<XIcon className="h-3.5 w-3.5" />} />
      <DeliveryStatRow label="Pending" value={pending} tone="pending" icon={<ClockIcon className="h-3.5 w-3.5" />} />
    </div>
  );
}

/* =========================================================
   STAFF — BATCH/DATE REPORT GENERATOR (GET /api/staff/report)
   Standalone filterable panel: Batch + Date -> Generate Report,
   rendering every session the backend returns for that batch/date
   (the endpoint is not scoped to a single session).
========================================================= */

function StaffReportPanel({ batches }: { batches: Batch[] }) {
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StaffReportResponse | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!batchId || !date) {
      setError("Select a batch and a date to generate a report.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({ batch_id: batchId, date });
      const data = (await api(`/api/staff/report?${params.toString()}`)) as StaffReportResponse;
      setResult(data);
    } catch (err: any) {
      setError(friendlyActionError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
      <div className="border-b border-slate-100 p-5">
        <h3 className="text-lg font-bold text-slate-900">Attendance &amp; Delivery Report</h3>
        <p className="mt-1 text-sm text-slate-500">
          Pick a batch and a date to see every session's approval, attendance and delivery counts.
        </p>
      </div>

      <form onSubmit={generate} className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/50 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Batch</label>
          <select
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">Select batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date</label>
          <input
            type="date"
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <BarChartIcon className="h-4 w-4" />}
          {loading ? "Generating report..." : "Generate Report"}
        </button>
      </form>

      <div className="p-5">
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {!error && !loading && result && result.sessions.length === 0 && (
          <EmptyState
            title="No sessions found"
            subtitle="No sessions found for the selected batch and date."
          />
        )}

        {result && result.sessions.length > 0 && (
          <div className="overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Badge>{result.batch}</Badge>
              <Badge>{result.date}</Badge>
            </div>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="p-3">Subject / Teacher</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Enrolled</th>
                  <th className="p-3 text-right">Attendance</th>
                  <th className="p-3 text-right">Sent</th>
                  <th className="p-3 text-right">Pending</th>
                  <th className="p-3 text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {result.sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {s.subject_name || "Untitled Subject"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.teacher_name || "Teacher not assigned"}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-slate-600">{s.type}</td>
                    <td className="p-3 text-sm text-slate-600">{s.time}</td>
                    <td className="p-3">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-slate-700">
                      {s.enrolled_student_count}
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-slate-700">
                      {s.attendance_count}
                    </td>
                    <td className="p-3 text-right text-sm font-medium text-emerald-600">{s.delivery.sent}</td>
                    <td className="p-3 text-right text-sm font-medium text-amber-600">{s.delivery.pending}</td>
                    <td className="p-3 text-right text-sm font-medium text-rose-600">{s.delivery.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!result && !error && !loading && (
          <p className="text-sm text-slate-400">Select a batch and date, then generate a report.</p>
        )}
      </div>
    </div>
  );
}

function ReportModal({
  open,
  session,
  batchName,
  loading,
  error,
  data,
  onClose,
}: {
  open: boolean;
  session: Session | null;
  batchName: string;
  loading: boolean;
  error: string;
  data: StaffReport | null;
  onClose: () => void;
}) {
  // Close on Escape, matching the Create/Edit Session modal's behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !session) return null;

  const enrolled = Number(data?.enrolled ?? 0);
  const attended = Number(data?.attendance ?? 0);
  const absent = data ? Math.max(0, enrolled - attended) : 0;
  const sent = Number(data?.sent ?? 0);
  const failed = Number(data?.failed ?? 0);
  const pending = Number(data?.pending ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-scale-in relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <BarChartIcon className="h-4 w-4" />
              </span>
              <h3 className="text-lg font-bold text-slate-900">Attendance &amp; Delivery Report</h3>
            </div>

            <p className="mt-2 text-base font-semibold text-slate-800">
              {subjectNameOf(session)}
              <span className="ml-2 text-sm font-medium text-slate-400">{teacherNameOf(session)}</span>
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Badge>{batchName}</Badge>
              <Badge>{session.type}</Badge>
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                {session.date}
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                {session.time}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close report"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-400">
            <Spinner className="h-6 w-6" />
            <p className="text-sm font-medium">Loading report...</p>
          </div>
        ) : error ? (
          <div className="animate-fade-in flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-rose-700">{error}</p>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Attendance Summary</p>
              <div className="grid grid-cols-3 gap-3">
                <ReportStatCard label="Enrolled" value={enrolled} accent="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />
                <ReportStatCard label="Attended" value={attended} accent="bg-emerald-50 text-emerald-700 ring-emerald-600/20" />
                <ReportStatCard label="Absent" value={absent} accent="bg-rose-50 text-rose-700 ring-rose-600/20" />
              </div>
            </div>

            {data && (
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Delivery</p>
                <ReportDeliverySummary sent={sent} failed={failed} pending={pending} />
              </div>
            )}
          </div>
        )}

        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DELIVERY STATUS MODAL (Staff — Status)
========================================================= */

function DeliveryStatusModal({
  open,
  session,
  loading,
  error,
  data,
  onClose,
}: {
  open: boolean;
  session: Session | null;
  loading: boolean;
  error: string;
  data: DeliveryReport | null;
  onClose: () => void;
}) {
  // Close on Escape, matching the other modals' behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !session) return null;

  const sent = Number(data?.sent ?? 0);
  const failed = Number(data?.failed ?? 0);
  const pending = Number(data?.pending ?? 0);
  const recipients = data?.recipients ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-scale-in relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <ClipboardListIcon className="h-4 w-4" />
              </span>
              <h3 className="text-lg font-bold text-slate-900">Delivery Status</h3>
            </div>

            <p className="mt-2 text-base font-semibold text-slate-800">
              {subjectNameOf(session)}
              <span className="ml-2 text-sm font-medium text-slate-400">{teacherNameOf(session)}</span>
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Badge>{session.type}</Badge>
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                {session.date}
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                {session.time}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close delivery status"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-400">
            <Spinner className="h-6 w-6" />
            <p className="text-sm font-medium">Loading delivery status...</p>
          </div>
        ) : error ? (
          <div className="animate-fade-in flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-rose-700">{error}</p>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Delivery Summary</p>
              <div className="grid grid-cols-3 gap-3">
                <ReportStatCard label="Sent" value={sent} accent="bg-blue-50 text-blue-700 ring-blue-600/20" />
                <ReportStatCard label="Failed" value={failed} accent="bg-rose-50 text-rose-700 ring-rose-600/20" />
                <ReportStatCard label="Pending" value={pending} accent="bg-amber-50 text-amber-700 ring-amber-600/20" />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Recipients</p>
              {recipients.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                  No delivery records found.
                </p>
              ) : (
                <div className="space-y-2">
                  {recipients.map((r) => (
                    <div
                      key={r.student_id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5"
                    >
                      <span className="text-sm font-semibold text-slate-700">{r.student_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-400">Attempts: {r.attempt_count}</span>
                        <StatusPill status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STAFF — ENROLLED STUDENTS MODAL
   Renders batch.students from the existing GET /api/staff/batches
   response — no per-batch or per-student API calls.
========================================================= */

function EnrolledStudentsModal({
  batch,
  open,
  onClose,
}: {
  batch: Batch | null;
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape, matching the other modals' behavior.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !batch) return null;

  const enrolledCount = enrolledCountOf(batch);
  const students = batch.students;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-scale-in relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <UsersIcon className="h-4 w-4" />
              </span>
              <h3 className="text-lg font-bold text-slate-900">{batch.name}</h3>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {enrolledCount} enrolled student{enrolledCount === 1 ? "" : "s"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {!students ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
            Student information is unavailable.
          </p>
        ) : students.length === 0 ? (
          <EmptyState title="No students enrolled" subtitle="This batch has no enrolled students yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="p-3">Student ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.student_id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 text-sm font-medium text-slate-500">{student.student_id}</td>
                    <td className="p-3 text-sm font-semibold text-slate-800">{student.name}</td>
                    <td className="p-3 text-sm text-slate-600">{student.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STAFF — ATTENDANCE MANAGEMENT
   GET  /api/staff/sessions/{session_id}/attendance
   PUT  /api/staff/sessions/{session_id}/attendance/{student_id}
========================================================= */

type AttendanceFilter = "ALL" | "PRESENT" | "ABSENT" | "NOT_MARKED";

const ATTENDANCE_FILTER_LABEL: Record<AttendanceFilter, string> = {
  ALL: "All",
  PRESENT: "Present",
  ABSENT: "Absent",
  NOT_MARKED: "Not Marked",
};

const StaffAttendancePanel = React.forwardRef<
  HTMLDivElement,
  {
    batches: Batch[];
    sessions: Session[];
    selectedBatchId: string;
    selectedSessionId: string;
    onSelectBatch: (batchId: string) => void;
    onSelectSession: (sessionId: string) => void;
    onBack: () => void;
  }
>(function StaffAttendancePanel(
  { batches, sessions, selectedBatchId, selectedSessionId, onSelectBatch, onSelectSession, onBack },
  ref
) {
  const [data, setData] = useState<StaffSessionAttendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AttendanceFilter>("ALL");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Approved sessions are the only ones the backend allows attendance
  // management for — mirrors the same rule already used for Deliver/Retry.
  const approvedSessionsForBatch = useMemo(
    () =>
      sessions
        .filter((s) => s.batch_id === selectedBatchId && s.status === "APPROVED")
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [sessions, selectedBatchId]
  );

  // Load the roster whenever the selected session changes. Reset local
  // search/filter so a stale filter from a previous session doesn't hide
  // students in the newly loaded one.
  useEffect(() => {
    setSearch("");
    setFilter("ALL");
    setMessage("");

    if (!selectedSessionId) {
      setData(null);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    getStaffSessionAttendance(selectedSessionId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyActionError(err, "staffAttendance"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  async function mark(studentId: string, status: "PRESENT" | "ABSENT") {
    if (!selectedSessionId || savingId) return;

    setSavingId(studentId);
    setMessage("");

    try {
      const updated = await updateStaffStudentAttendance(selectedSessionId, studentId, status);

      // Apply the server's own response rather than assuming the
      // requested status was accepted verbatim, then recompute counts
      // from the resulting roster so the summary never drifts.
      setData((prev) => {
        if (!prev) return prev;
        const students = prev.students.map((s) =>
          s.student_id === studentId ? { ...s, ...updated } : s
        );
        const present = students.filter((s) => s.status === "PRESENT").length;
        const absent = students.filter((s) => s.status === "ABSENT").length;
        return {
          ...prev,
          students,
          present_count: present,
          absent_count: absent,
          not_marked_count: students.length - present - absent,
        };
      });

      setMessage(`Attendance marked ${status === "PRESENT" ? "Present" : "Absent"}.`);
    } catch (err: any) {
      setError(friendlyActionError(err, "staffAttendance"));
    } finally {
      setSavingId(null);
    }
  }

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();

    return data.students.filter((s) => {
      const effectiveStatus: AttendanceFilter = (s.status ?? "NOT_MARKED") as AttendanceFilter;
      const matchesFilter = filter === "ALL" || effectiveStatus === filter;
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [data, search, filter]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) || null;

  return (
    <div ref={ref} className="mb-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-center gap-3">
          {selectedBatchId && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Back to batches"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-900">Attendance Management</h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedBatch
                ? `Batch: ${selectedBatch.name}`
                : "Select a batch to view and manage student attendance."}
            </p>
          </div>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
          <UsersIcon className="h-4.5 w-4.5" />
        </span>
      </div>

      {/* Step 1: batch cards */}
      {!selectedBatchId && (
        <div className="p-5">
          {batches.length === 0 ? (
            <EmptyState title="No batches found" subtitle="Create a batch to start managing attendance." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {batches.map((batch) => {
                const approvedCount = sessions.filter(
                  (s) => s.batch_id === batch.id && s.status === "APPROVED"
                ).length;
                return (
                  <div
                    key={batch.id}
                    className="animate-fade-in flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 text-sm font-bold text-white shadow-sm">
                        {getBatchInitials(batch.name)}
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Batch</div>
                        <div className="mt-0.5 text-lg font-bold text-slate-900">{batch.name}</div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs font-medium text-slate-400">
                      {approvedCount === 0
                        ? "No approved sessions yet"
                        : `${approvedCount} approved session${approvedCount === 1 ? "" : "s"} available`}
                    </p>

                    <button
                      type="button"
                      onClick={() => onSelectBatch(batch.id)}
                      className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      <UsersIcon className="h-3.5 w-3.5" />
                      View Attendance
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: session selector + roster */}
      {selectedBatchId && (
        <div className="p-5">
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Session</label>
            <div className="relative max-w-md">
              <select
                value={selectedSessionId}
                onChange={(e) => onSelectSession(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 pr-9 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              >
                <option value="">Select a session…</option>
                {approvedSessionsForBatch.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectNameOf(s)} · {s.type} · {s.date}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {approvedSessionsForBatch.length === 0 && (
              <p className="mt-2 text-xs font-medium text-amber-600">
                Attendance can be managed only for approved sessions. This batch has none yet.
              </p>
            )}
          </div>

          {!selectedSessionId ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
              Select a session above to view its attendance roster.
            </p>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-400">
              <Spinner className="h-6 w-6" />
              <p className="text-sm font-medium">Loading attendance...</p>
            </div>
          ) : error ? (
            <div className="animate-fade-in flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <XIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-rose-700">{error}</p>
            </div>
          ) : data ? (
            <div className="animate-fade-in space-y-5">
              <MessagePanel message={message} onClear={() => setMessage("")} />

              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ReportStatCard label="Enrolled" value={data.enrolled_count} accent="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />
                <ReportStatCard label="Present" value={data.present_count} accent="bg-emerald-50 text-emerald-700 ring-emerald-600/20" />
                <ReportStatCard label="Absent" value={data.absent_count} accent="bg-rose-50 text-rose-700 ring-rose-600/20" />
                <ReportStatCard label="Not Marked" value={data.not_marked_count} accent="bg-slate-100 text-slate-600 ring-slate-400/30" />
              </div>

              {/* Search + filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email or student ID"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 pl-9 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(ATTENDANCE_FILTER_LABEL) as AttendanceFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        filter === f
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {ATTENDANCE_FILTER_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Roster */}
              {filteredStudents.length === 0 ? (
                <EmptyState title="No students found" subtitle="No students match your search." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[720px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <th className="p-3.5">Student ID</th>
                        <th className="p-3.5">Name</th>
                        <th className="p-3.5">Email</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => {
                        const effectiveStatus: AttendanceFilter = (student.status ??
                          "NOT_MARKED") as AttendanceFilter;
                        const isSaving = savingId === student.student_id;

                        return (
                          <tr
                            key={student.student_id}
                            className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/60"
                          >
                            <td className="p-3.5 text-sm font-medium text-slate-500">{student.student_id}</td>
                            <td className="p-3.5 text-sm font-semibold text-slate-800">{student.name}</td>
                            <td className="p-3.5 max-w-[220px] truncate text-sm text-slate-500" title={student.email}>
                              {student.email}
                            </td>
                            <td className="p-3.5">
                              <StatusPill status={effectiveStatus} label={effectiveStatus.replace(/_/g, " ")} />
                            </td>
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isSaving || student.status === "PRESENT"}
                                  onClick={() => mark(student.student_id, "PRESENT")}
                                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                                    student.status === "PRESENT"
                                      ? "bg-emerald-600 text-white shadow-sm disabled:opacity-100"
                                      : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                  }`}
                                >
                                  {isSaving ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
                                  Present
                                </button>

                                <button
                                  type="button"
                                  disabled={isSaving || student.status === "ABSENT"}
                                  onClick={() => mark(student.student_id, "ABSENT")}
                                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                                    student.status === "ABSENT"
                                      ? "bg-rose-600 text-white shadow-sm disabled:opacity-100"
                                      : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                  }`}
                                >
                                  {isSaving ? <Spinner className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
                                  Absent
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});

/* =========================================================
   STAFF DASHBOARD
========================================================= */

function Staff() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDeliveries, setPendingDeliveries] = useState(0);

  // Which delivery/retry action is currently in flight, if any.
  const [actionState, setActionState] = useState<{ id: string; kind: "deliver" | "retry" } | null>(
    null
  );
  const isActing = actionState !== null;

  // Create / edit session modal.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  // Report modal (Staff — Attendance & Delivery).
  const [reportSession, setReportSession] = useState<Session | null>(null);
  const [reportData, setReportData] = useState<StaffReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const reportOpen = reportSession !== null;

  // Delivery Status modal (Staff — Status).
  const [statusSession, setStatusSession] = useState<Session | null>(null);
  const [statusData, setStatusData] = useState<DeliveryReport | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const statusOpen = statusSession !== null;

  // Attendance Management (Staff — batch -> session -> roster).
  const [attendanceBatchId, setAttendanceBatchId] = useState("");
  const [attendanceSessionId, setAttendanceSessionId] = useState("");
  const attendanceSectionRef = useRef<HTMLDivElement | null>(null);

  // Enrolled Students modal (Staff — View Students per batch).
  // Reuses the batches already loaded by load() below — no per-batch
  // or per-student API calls.
  const [selectedStudentsBatch, setSelectedStudentsBatch] = useState<Batch | null>(null);

  // Jumps straight to a session's roster from the sessions table/report
  // context, reusing the same Attendance Management panel and state.
  function openAttendanceFor(session: Session) {
    setAttendanceBatchId(session.batch_id);
    setAttendanceSessionId(session.id);
    requestAnimationFrame(() => {
      attendanceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function load() {
    try {
      const [sessionData, batchData] = await Promise.all([
        api("/api/sessions"),
        api("/api/staff/batches"),
      ]);

      setSessions(sessionData);
      setBatches(batchData);

      // Pending-deliveries count needs a per-session lookup — only fetch it
      // for APPROVED sessions (the only ones that can have deliveries at all)
      // and never let one failing lookup break the rest of the dashboard.
      const approved = (sessionData as Session[]).filter((s) => s.status === "APPROVED");
      const deliveryResults = await Promise.all(
        approved.map((s) =>
          api(`/api/sessions/${s.id}/deliveries`).catch(() => null)
        )
      );
      const totalPending = deliveryResults.reduce(
        (sum, d: any) => sum + (d ? Number(d.pending ?? 0) : 0),
        0
      );
      setPendingDeliveries(totalPending);
    } catch (err: any) {
      setMessage(friendlyActionError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function act(
    path: string,
    method: "GET" | "POST",
    sessionId: string,
    kind: "deliver" | "retry"
  ) {
    setActionState({ id: sessionId, kind });
    setMessage("");

    try {
      const data = await api(path, { method });

      const prefix = kind === "deliver" ? "Delivery completed" : "Retry completed";
      setMessage(formatDeliveryFeedback(prefix, data));

      await load();
    } catch (err: any) {
      setMessage(friendlyActionError(err, "deliver"));
    } finally {
      setActionState(null);
    }
  }

  function openCreateModal() {
    setModalMode("create");
    setEditingSession(null);
    setModalOpen(true);
  }

  function openEditModal(session: Session) {
    setModalMode("edit");
    setEditingSession(session);
    setModalOpen(true);
  }

  async function handleCreateSubmit(values: SessionFormValues) {
    try {
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify(values),
      });

      setModalOpen(false);
      setMessage(`Session created successfully as Draft.`);
      await load();
    } catch (err: any) {
      throw new Error(friendlyError(err));
    }
  }

  async function handleEditSubmit(values: SessionFormValues) {
    if (!editingSession) return;

    const wasApproved = editingSession.status === "APPROVED";

    try {
      await api(`/api/sessions/${editingSession.id}`, {
        method: "PUT",
        body: JSON.stringify(values),
      });

      setModalOpen(false);
      setMessage(
        wasApproved
          ? "Session updated. Reviewer approval is required again before delivery."
          : "Session updated successfully."
      );
      await load();
    } catch (err: any) {
      throw new Error(friendlyError(err));
    }
  }

  // Opens the report modal for a session and loads its batch/date report
  // from the existing GET /api/staff/report endpoint. The endpoint returns
  // every session for that batch/date, so we match this session's id rather
  // than assuming a single flat report or taking sessions[0].
  async function openReport(session: Session) {
    setReportSession(session);
    setReportData(null);
    setReportError("");
    setReportLoading(true);

    try {
      const reportDate = String(session.date ?? "").trim().slice(0, 10);

      const params = new URLSearchParams({
        batch_id: session.batch_id,
        date: reportDate,
      });

      const response = (await api(
        `/api/staff/report?${params.toString()}`
      )) as StaffReportResponse;

      const matchingSession = response.sessions.find(
        (item) => item.id === session.id
      );

      if (!matchingSession) {
        throw new Error("Report data for this session was not found.");
      }

      const report: StaffReport = {
        enrolled: Number(matchingSession.enrolled_student_count ?? 0),
        attendance: Number(matchingSession.attendance_count ?? 0),
        sent: Number(matchingSession.delivery?.sent ?? 0),
        failed: Number(matchingSession.delivery?.failed ?? 0),
        pending: Number(matchingSession.delivery?.pending ?? 0),
      };

      setReportData(report);
    } catch (err: any) {
      setReportError(friendlyDetailError(err, "Unable to load attendance report."));
    } finally {
      setReportLoading(false);
    }
  }

  function closeReport() {
    setReportSession(null);
    setReportData(null);
    setReportError("");
    setReportLoading(false);
  }

  // Opens the Delivery Status modal for a session and loads it from the
  // existing, already-correct GET /api/sessions/{id}/deliveries endpoint.
  async function openStatus(session: Session) {
    setStatusSession(session);
    setStatusData(null);
    setStatusError("");
    setStatusLoading(true);

    try {
      const data = (await api(`/api/sessions/${session.id}/deliveries`)) as DeliveryReport;
      setStatusData(data);
    } catch (err: any) {
      setStatusError(friendlyDetailError(err, "Unable to load delivery status."));
    } finally {
      setStatusLoading(false);
    }
  }

  function closeStatus() {
    setStatusSession(null);
    setStatusData(null);
    setStatusError("");
    setStatusLoading(false);
  }

  const approvedCount = sessions.filter((s) => s.status === "APPROVED").length;
  const draftCount = sessions.filter((s) => s.status === "DRAFT").length;

  const reportBatchName =
    (reportSession && batches.find((b) => b.id === reportSession.batch_id)?.name) ||
    reportSession?.batch_id ||
    "";

  const modalInitialValues: SessionFormValues =
    modalMode === "edit" && editingSession
      ? {
          batch_id: editingSession.batch_id,
          date: editingSession.date,
          type: (editingSession.type as SessionFormValues["type"]) || "LIVE",
          time: editingSession.time,
          zoom_url: editingSession.zoom_url,
          subject_name: editingSession.subject_name || "",
          teacher_name: editingSession.teacher_name || "",
        }
      : { ...EMPTY_SESSION_FORM, batch_id: batches[0]?.id || "" };

  return (
    <Shell title="Staff Dashboard" subtitle="Staff Portal" icon={<LayersIcon className="h-5 w-5" />}>
      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarIcon className="h-5 w-5 text-violet-600" />}
          label="Total Sessions"
          value={sessions.length}
          accent="bg-violet-50"
        />
        <StatCard
          icon={<PencilIcon className="h-5 w-5 text-amber-600" />}
          label="Draft Sessions"
          value={draftCount}
          accent="bg-amber-50"
        />
        <StatCard
          icon={<CheckIcon className="h-5 w-5 text-emerald-600" />}
          label="Approved Sessions"
          value={approvedCount}
          accent="bg-emerald-50"
        />
        <StatCard
          icon={<ClockIcon className="h-5 w-5 text-rose-600" />}
          label="Pending Deliveries"
          value={pendingDeliveries}
          accent="bg-rose-50"
        />
      </div>

      {/* Batches */}
      {batches.length > 0 && (
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => (
            <div
              className="animate-fade-in group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-md"
              key={batch.id}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm">
                {getBatchInitials(batch.name)}
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Batch</div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">{batch.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Enrolled Students */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
        <div className="border-b border-slate-100 p-5">
          <h3 className="text-lg font-bold text-slate-900">Enrolled Students</h3>
          <p className="mt-1 text-sm text-slate-500">View students enrolled in each batch.</p>
        </div>

        <div className="p-5">
          {batches.length === 0 ? (
            <EmptyState title="No batches found" subtitle="Create a batch to see enrolled students." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {batches.map((batch) => {
                const enrolledCount = enrolledCountOf(batch);
                return (
                  <div
                    key={batch.id}
                    className="card-accent-top animate-fade-in flex flex-col gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm">
                          {getBatchInitials(batch.name)}
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Batch</div>
                          <div className="mt-0.5 text-lg font-bold text-slate-900">{batch.name}</div>
                        </div>
                      </div>
                      <span className="text-2xl font-extrabold text-slate-900">{enrolledCount}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                      <UsersIcon className="h-4 w-4" />
                      {enrolledCount} enrolled
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedStudentsBatch(batch)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      View Students
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <MessagePanel message={message} onClear={() => setMessage("")} />

      <StaffAttendancePanel
        ref={attendanceSectionRef}
        batches={batches}
        sessions={sessions}
        selectedBatchId={attendanceBatchId}
        selectedSessionId={attendanceSessionId}
        onSelectBatch={(batchId) => {
          setAttendanceBatchId(batchId);
          setAttendanceSessionId("");
        }}
        onSelectSession={(sessionId) => setAttendanceSessionId(sessionId)}
        onBack={() => {
          setAttendanceBatchId("");
          setAttendanceSessionId("");
        }}
      />

      <StaffReportPanel batches={batches} />

      {/* Sessions */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Class Sessions</h3>
            <p className="mt-1 text-sm text-slate-500">Create, manage and deliver class sessions.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create Session
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin-slow" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-10">
            <EmptyState title="No sessions found" subtitle="Create your first session to get started." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="p-4">Subject / Teacher</th>
                  <th className="p-4">
                    <span className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Date</span>
                  </th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {sessions.map((session) => {
                  const isApproved = session.status === "APPROVED";
                  const actingOn = (kind: "deliver" | "retry") =>
                    actionState?.id === session.id && actionState.kind === kind;
                  const statusLoadingHere = statusLoading && statusSession?.id === session.id;

                  return (
                    <tr
                      className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/60"
                      key={session.id}
                    >
                      <td className="p-4">
                        <div className="text-sm font-semibold text-slate-800">{subjectNameOf(session)}</div>
                        <div className="mt-0.5 max-w-[180px] truncate text-xs text-slate-400" title={teacherNameOf(session)}>
                          {teacherNameOf(session)}
                        </div>
                      </td>

                      <td className="p-4 text-sm font-medium text-slate-700">{session.date}</td>

                      <td className="p-4 text-sm text-slate-600">{session.type}</td>

                      <td className="p-4">
                        <StatusPill status={session.status} />
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2 py-1">
                          {isApproved ? (
                            <>
                              <button
                                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                                disabled={isActing}
                                onClick={() =>
                                  act(`/api/sessions/${session.id}/deliver`, "POST", session.id, "deliver")
                                }
                              >
                                {actingOn("deliver") ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
                                {actingOn("deliver") ? "Delivering..." : "Deliver"}
                              </button>

                              <button
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                                disabled={isActing}
                                onClick={() =>
                                  act(`/api/sessions/${session.id}/retry-delivery`, "POST", session.id, "retry")
                                }
                              >
                                {actingOn("retry") ? <Spinner className="h-3.5 w-3.5" /> : <RefreshIcon className="h-3.5 w-3.5" />}
                                {actingOn("retry") ? "Retrying..." : "Retry"}
                              </button>

                              {/* IMPORTANT: Status uses GET */}
                              <button
                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-600 underline-offset-2 transition hover:bg-indigo-50 hover:underline disabled:opacity-50"
                                disabled={isActing || statusLoadingHere}
                                onClick={() => openStatus(session)}
                              >
                                {statusLoadingHere ? <Spinner className="h-3.5 w-3.5" /> : <ClipboardListIcon className="h-3.5 w-3.5" />}
                                {statusLoadingHere ? "Checking..." : "Status"}
                              </button>

                              <button
                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-600 underline-offset-2 transition hover:bg-violet-50 hover:underline disabled:opacity-50"
                                disabled={isActing}
                                onClick={() => openReport(session)}
                              >
                                <BarChartIcon className="h-3.5 w-3.5" />
                                Report
                              </button>

                              <button
                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-cyan-600 underline-offset-2 transition hover:bg-cyan-50 hover:underline disabled:opacity-50"
                                disabled={isActing}
                                onClick={() => openAttendanceFor(session)}
                              >
                                <UsersIcon className="h-3.5 w-3.5" />
                                Attendance
                              </button>

                              <button
                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
                                onClick={() => openEditModal(session)}
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                onClick={() => openEditModal(session)}
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <span className="text-xs font-medium text-slate-400">Awaiting approval</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SessionModal
        open={modalOpen}
        mode={modalMode}
        batches={batches}
        initialValues={modalInitialValues}
        isApprovedEdit={modalMode === "edit" && editingSession?.status === "APPROVED"}
        onClose={() => setModalOpen(false)}
        onSubmit={modalMode === "create" ? handleCreateSubmit : handleEditSubmit}
      />

      <ReportModal
        open={reportOpen}
        session={reportSession}
        batchName={reportBatchName}
        loading={reportLoading}
        error={reportError}
        data={reportData}
        onClose={closeReport}
      />

      <DeliveryStatusModal
        open={statusOpen}
        session={statusSession}
        loading={statusLoading}
        error={statusError}
        data={statusData}
        onClose={closeStatus}
      />

      <EnrolledStudentsModal
        batch={selectedStudentsBatch}
        open={selectedStudentsBatch !== null}
        onClose={() => setSelectedStudentsBatch(null)}
      />
    </Shell>
  );
}

/* =========================================================
   REVIEWER DASHBOARD
========================================================= */

function Reviewer() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const data = await api("/api/sessions");
      setSessions(data);
    } catch (err: any) {
      setMessage(friendlyActionError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(sessionId: string) {
    setLoading(true);
    setMessage("");

    try {
      await api(`/api/sessions/${sessionId}/approve`, {
        method: "POST",
      });

      setMessage("Session approved successfully.");

      await load();
    } catch (err: any) {
      setMessage(friendlyActionError(err, "approve"));
    } finally {
      setLoading(false);
    }
  }

  const draftSessions = sessions.filter(
    (session) => session.status === "DRAFT"
  );

  return (
    <Shell title="Reviewer Approvals" subtitle="Reviewer Portal" icon={<CheckIcon className="h-5 w-5" />}>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <StatCard
          icon={<ClockIcon className="h-5 w-5 text-amber-600" />}
          label="Pending Approval"
          value={draftSessions.length}
          accent="bg-amber-50"
        />
      </div>

      <MessagePanel message={message} onClear={() => setMessage("")} />

      {draftSessions.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          subtitle="All current sessions have already been approved."
        />
      ) : (
        <div className="grid gap-4">
          {draftSessions.map((session) => (
            <div
              className="animate-fade-in rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm shadow-slate-200/50 transition hover:shadow-md"
              key={session.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-bold text-slate-900">
                    {subjectNameOf(session)} · {session.type}
                  </div>

                  <div className="mt-1 text-sm font-medium text-slate-500">
                    Teacher: {teacherNameOf(session)}
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                    <CalendarIcon className="h-4 w-4" />
                    {session.date}
                    <span className="text-slate-300">·</span>
                    <ClockIcon className="h-4 w-4" />
                    {session.time}
                  </div>
                </div>

                <StatusPill status="DRAFT" />
              </div>

              <a
                className="mt-4 flex items-center gap-1.5 break-all text-sm font-medium text-indigo-600 hover:underline"
                href={session.zoom_url}
                target="_blank"
                rel="noreferrer"
              >
                <LinkIcon className="h-4 w-4 shrink-0" />
                {session.zoom_url}
              </a>

              <button
                className="mt-5 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                disabled={loading}
                onClick={() => approve(session.id)}
              >
                {loading ? <Spinner /> : <CheckIcon className="h-4 w-4" />}
                {loading ? "Approving..." : "Approve Session"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

/* =========================================================
   STUDENT DASHBOARD
========================================================= */

function Student() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api("/api/student/sessions");
      setSessions(data);
    } catch (err: any) {
      setMessage(friendlyActionError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitAttendance(
    sessionId: string,
    attendanceStatus: "PRESENT" | "ABSENT"
  ) {
    setLoadingId(sessionId);
    setMessage("");

    try {
      const user: User = JSON.parse(
        localStorage.getItem("user") || "{}"
      );

      await api(
        `/api/student/sessions/${sessionId}/attendance`,
        {
          method: "POST",
          body: JSON.stringify({
            student_id: user.student_id,
            status: attendanceStatus,
          }),
        }
      );

      setMessage(
        `Attendance submitted: ${attendanceStatus}`
      );
    } catch (err: any) {
      setMessage(friendlyActionError(err, "attendance"));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Shell title="My Approved Sessions" subtitle="Student Portal" icon={<GraduationCapIcon className="h-5 w-5" />}>
      <MessagePanel message={message} onClear={() => setMessage("")} />

      {sessions.length === 0 ? (
        <EmptyState
          title="No approved sessions"
          subtitle="There are currently no approved sessions available for your batch."
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {sessions.map((session) => (
            <div
              className="animate-fade-in overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-md"
              key={session.id}
            >
              <div className="bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <Badge>{session.type}</Badge>
                  <StatusPill status={session.status} />
                </div>
                <h3 className="mt-3 text-xl font-bold text-white">{subjectNameOf(session)}</h3>
                <p className="mt-0.5 text-sm font-medium text-indigo-100">{teacherNameOf(session)}</p>
              </div>

              <div className="p-5">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <CalendarIcon className="h-4 w-4" />
                  {session.date}
                  <span className="text-slate-300">·</span>
                  <ClockIcon className="h-4 w-4" />
                  {session.time}
                </p>

                <a
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                  href={session.zoom_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LinkIcon className="h-4 w-4" />
                  Join Session
                </a>

                <div className="mt-5 flex gap-2">
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    disabled={loadingId === session.id}
                    onClick={() =>
                      submitAttendance(
                        session.id,
                        "PRESENT"
                      )
                    }
                  >
                    {loadingId === session.id ? <Spinner /> : <CheckIcon className="h-4 w-4" />}
                    Present
                  </button>

                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    disabled={loadingId === session.id}
                    onClick={() =>
                      submitAttendance(
                        session.id,
                        "ABSENT"
                      )
                    }
                  >
                    {loadingId === session.id ? <Spinner /> : <XIcon className="h-4 w-4" />}
                    Absent
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

/* =========================================================
   COMMON SHELL
========================================================= */

function Shell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const user = getStoredUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <GraduationCapIcon className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight text-slate-900">KMIE</div>
              <div className="hidden text-xs text-slate-400 sm:block">Class Link &amp; Delivery Management</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden items-center gap-2.5 sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {initialsOf(user.name || "?")}
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-slate-800">{user.name}</div>
                  <div className="text-xs text-slate-400">{user.role}</div>
                </div>
              </div>
            )}
            <button
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              onClick={logout}
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-7 flex items-center gap-3">
          {icon && (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              {icon}
            </div>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">{subtitle}</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("user") || "null"
      );
    } catch {
      return null;
    }
  });

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  if (user.role === "STAFF") {
    return <Staff />;
  }

  if (user.role === "REVIEWER") {
    return <Reviewer />;
  }

  return <Student />;
}

createRoot(document.getElementById("root")!).render(
  <App />
);