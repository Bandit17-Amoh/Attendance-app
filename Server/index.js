const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

// Serve React frontend from the dist folder
app.use(express.static(path.join(__dirname, "../Client/dist")));

// In-memory store
const sessions = {};

// Create a new session
app.post("/api/sessions", (req, res) => {
  const { className, students } = req.body;
  if (!className || !Array.isArray(students)) {
    return res.status(400).json({ error: "className and students[] required" });
  }
  const sessionId = uuidv4();
  const studentMap = {};
  students.forEach((s) => {
    studentMap[s.id.trim()] = { name: s.name.trim(), present: false, time: null };
  });
  sessions[sessionId] = {
    className,
    students: studentMap,
    active: true,
    createdAt: new Date().toISOString(),
  };
  res.json({ sessionId });
});

// Get session info
app.get("/api/sessions/:id", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({
    sessionId: req.params.id,
    className: session.className,
    active: session.active,
    createdAt: session.createdAt,
    students: session.students,
    summary: {
      total: Object.keys(session.students).length,
      present: Object.values(session.students).filter((s) => s.present).length,
    },
  });
});

// Student marks attendance
app.post("/api/sessions/:id/attend", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.active) return res.status(400).json({ error: "Session is closed" });
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: "studentId required" });
  const student = session.students[studentId.trim()];
  if (!student) return res.status(404).json({ error: "Student ID not found in this class" });
  if (student.present) return res.json({ alreadyMarked: true, name: student.name });
  student.present = true;
  student.time = new Date().toISOString();
  res.json({ success: true, name: student.name });
});

// Close session
app.patch("/api/sessions/:id/close", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "Session not found" });
  session.active = false;
  res.json({ closed: true });
});

// Reopen session
app.patch("/api/sessions/:id/reopen", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "Session not found" });
  session.active = true;
  res.json({ opened: true });
});

// All other routes serve the React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../Client/dist/index.html"));
});

const PORT = 4000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
