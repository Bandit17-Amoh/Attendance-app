import { useState, useEffect } from "react";

const API = "/api";
const NGROK_URL = "https://attendance-app-production-8358.up.railway.app";

function getQRImageUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=1a1a2e&margin=10`;
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  return lines.map((line) => {
    const [id, ...rest] = line.split(",");
    return { id: id.trim(), name: rest.join(",").trim() };
  }).filter((s) => s.id && s.name);
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function downloadCSV(session, sessionId) {
  const rows = [["Student ID", "Name", "Present", "Time Marked"]];
  Object.entries(session.students).forEach(([id, s]) => {
    rows.push([id, s.name, s.present ? "Yes" : "No", s.present ? formatTime(s.time) : ""]);
  });
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendance-${session.className}-${sessionId.slice(0, 6)}.csv`;
  a.click();
}

// ─── Student Scan Page ──────────────────────────────────────────────────────
function StudentPage({ sessionId }) {
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    fetch(`${API}/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setSessionError(true); else setSessionInfo(d); })
      .catch(() => setSessionError(true));
  }, [sessionId]);

  async function handleSubmit() {
    if (!studentId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/attend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: studentId.trim() }),
      });
      const data = await res.json();
      if (data.error) { setStatus("error"); setMessage(data.error); }
      else if (data.alreadyMarked) { setStatus("already"); setMessage(`Hi ${data.name}, you're already marked present!`); }
      else { setStatus("success"); setMessage(`Welcome, ${data.name}! ✓ Attendance recorded.`); }
    } catch { setStatus("error"); setMessage("Could not connect to server."); }
    setLoading(false);
  }

  if (sessionError) return (
    <div className="scan-page error-page">
      <div className="scan-card">
        <div className="scan-icon">⚠️</div>
        <h2>Session Not Found</h2>
        <p>This QR code may be invalid or expired.</p>
      </div>
    </div>
  );

  if (!sessionInfo) return (
    <div className="scan-page"><div className="scan-card"><div className="spinner" /></div></div>
  );

  if (!sessionInfo.active) return (
    <div className="scan-page error-page">
      <div className="scan-card">
        <div className="scan-icon">🔒</div>
        <h2>The session Closed</h2>
        <p>The teacher has closed the attendance for <strong>{sessionInfo.className}</strong>.</p>
      </div>
    </div>
  );

  return (
    <div className="scan-page">
      <div className="scan-card">
        <div className="class-badge">{sessionInfo.className}</div>
        <h1>Mark Your Attendance</h1>
        <p className="scan-subtitle">Enter your registration number below</p>
        {!status ? (
          <div className="scan-form">
            <input className="scan-input" type="text" placeholder="Your Reg Number"
              value={studentId} onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()} autoFocus />
            <button className="scan-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? "Checking…" : "Submit"}
            </button>
          </div>
        ) : (
          <div className={`scan-result ${status}`}>
            <div className="result-icon">
              {status === "success" ? "✅" : status === "already" ? "ℹ️" : "❌"}
            </div>
            <p>{message}</p>
            {status === "error" && (
              <button className="scan-btn retry" onClick={() => setStatus(null)}>Try Again</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Teacher Dashboard ──────────────────────────────────────────────────────
function TeacherDashboard() {
  const [view, setView] = useState("create");
  const [className, setClassName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [parsedStudents, setParsedStudents] = useState([]);
  const [csvError, setCsvError] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [attendanceUrl, setAttendanceUrl] = useState("");
  const [pollInterval, setPollInterval] = useState(null);

  function handleCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const parsed = parseCSV(text);
      setCsvError(parsed.length === 0 ? "No valid rows found. Format: StudentID,Name" : "");
      setParsedStudents(parsed);
    };
    reader.readAsText(file);
  }

  function handleManualCSV(text) {
    setCsvText(text);
    const parsed = parseCSV(text);
    setParsedStudents(parsed);
    setCsvError(parsed.length === 0 ? "No valid rows. Format: StudentID,Name" : "");
  }

  async function createSession() {
    if (!className.trim()) return alert("Enter a class name.");
    if (parsedStudents.length === 0) return alert("Add at least one student.");
    setLoading(true);
    try {
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ className: className.trim(), students: parsedStudents }),
      });
      const data = await res.json();
      if (data.sessionId) {
        const sid = data.sessionId;
        setSessionId(sid);
        const url = `${NGROK_URL}/?session=${sid}`;
        setAttendanceUrl(url);
        setQrImageUrl(getQRImageUrl(url));
        await loadSession(sid);
        setView("session");
        const iv = setInterval(() => loadSession(sid), 3000);
        setPollInterval(iv);
      }
    } catch (err) {
      alert("Could not connect to server. Make sure the backend is running.");
    }
    setLoading(false);
  }

  async function loadSession(sid) {
    const res = await fetch(`${API}/sessions/${sid}`);
    const data = await res.json();
    if (!data.error) setSession(data);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
  }

  async function toggleSession() {
    const endpoint = session.active ? "close" : "reopen";
    await fetch(`${API}/sessions/${sessionId}/${endpoint}`, { method: "PATCH" });
    await loadSession(sessionId);
  }

  function newSession() {
    stopPolling();
    setView("create"); setClassName(""); setCsvText("");
    setParsedStudents([]); setSession(null); setSessionId(null);
    setQrImageUrl(""); setAttendanceUrl("");
  }

  useEffect(() => () => stopPolling(), []);

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="logo">
          <span className="logo-icon">📋</span>
          <span className="logo-text">ClassAttend</span>
        </div>
        {view === "session" && (
          <button className="btn-ghost" onClick={newSession}>+ New Session</button>
        )}
      </header>

      {view === "create" && (
        <div className="create-view">
          <div className="create-card">
            <h2>Generate Attendance Session</h2>
            <p className="sub">Set up a class and upload your student list to generate a QR code.</p>

            <label className="field-label">Class Name</label>
            <input className="field-input" placeholder="e.g. Unit Name"
              value={className} onChange={(e) => setClassName(e.target.value)} />

            <label className="field-label">Student List (CSV)</label>
            <p className="hint">Format: <code>RegistrationNumber,FullName</code> — one per line</p>
            <div className="csv-upload-area">
              <label className="upload-btn">
                📁 Upload PDF File
                <input type="file" accept=".csv,.txt" onChange={handleCSV} hidden />
              </label>
              <span className="or-divider">or paste below</span>
            </div>
            <textarea className="csv-textarea"
              placeholder={"STU001,Alice Mwangi\nSTU002,Brian Odhiambo\nSTU003,Carol Wanjiku"}
              value={csvText} onChange={(e) => handleManualCSV(e.target.value)} rows={6} />
            {csvError && <p className="csv-error">{csvError}</p>}
            {parsedStudents.length > 0 && <p className="csv-ok">✓ {parsedStudents.length} students loaded</p>}
            {parsedStudents.length > 0 && (
              <div className="preview-list">
                {parsedStudents.slice(0, 5).map((s) => (
                  <div key={s.id} className="preview-row">
                    <span className="pid">{s.id}</span>
                    <span className="pname">{s.name}</span>
                  </div>
                ))}
                {parsedStudents.length > 5 && (
                  <div className="preview-more">+{parsedStudents.length - 5} more students</div>
                )}
              </div>
            )}
            <button className="btn-primary" onClick={createSession} disabled={loading}>
              {loading ? "Creating…" : "Generate QR Code →"}
            </button>
          </div>
        </div>
      )}

      {view === "session" && session && (
        <div className="session-view">
          <div className="session-left">
            <div className="qr-card">
              <div className="qr-header">
                <h3>{session.className}</h3>
                <span className={`status-badge ${session.active ? "active" : "closed"}`}>
                  {session.active ? "● Live" : "○ Closed"}
                </span>
              </div>
              <div className="qr-wrap">
                {qrImageUrl ? (
                  <img src={qrImageUrl} alt="QR Code" className="qr-img"
                    onError={(e) => { e.target.style.display='none'; }} />
                ) : (
                  <div className="spinner" />
                )}
              </div>
              <p className="qr-hint">Scan this to mark attendance</p>
              <div className="qr-url">
                <input readOnly value={attendanceUrl} className="url-input" />
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(attendanceUrl)}>Copy</button>
              </div>
              <div className="session-actions">
                <button className={`btn-toggle ${session.active ? "close" : "open"}`} onClick={toggleSession}>
                  {session.active ? "🔒 Close Session" : "🔓 Reopen Session"}
                </button>
                <button className="btn-download" onClick={() => downloadCSV(session, sessionId)}>
                  ⬇ Download Sheet
                </button>
              </div>
            </div>
          </div>

          <div className="session-right">
            <div className="stats-row">
              <div className="stat-box"><div className="stat-num">{session.summary.total}</div><div className="stat-label">Total</div></div>
              <div className="stat-box present"><div className="stat-num">{session.summary.present}</div><div className="stat-label">Present</div></div>
              <div className="stat-box absent"><div className="stat-num">{session.summary.total - session.summary.present}</div><div className="stat-label">Absent</div></div>
              <div className="stat-box pct">
                <div className="stat-num">
                  {session.summary.total > 0 ? Math.round((session.summary.present / session.summary.total) * 100) : 0}%
                </div>
                <div className="stat-label">Attendance</div>
              </div>
            </div>

            <div className="attendance-table-wrap">
              <h4>Attendance Register <span className="live-tag">Live</span></h4>
              <table className="attendance-table">
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Status</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {Object.entries(session.students)
                    .sort((a, b) => (b[1].present ? 1 : 0) - (a[1].present ? 1 : 0))
                    .map(([id, s]) => (
                      <tr key={id} className={s.present ? "row-present" : "row-absent"}>
                        <td className="td-id">{id}</td>
                        <td>{s.name}</td>
                        <td><span className={`pill ${s.present ? "pill-present" : "pill-absent"}`}>{s.present ? "Present" : "Absent"}</span></td>
                        <td className="td-time">{formatTime(s.time)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  return sessionId ? <StudentPage sessionId={sessionId} /> : <TeacherDashboard />;
}
