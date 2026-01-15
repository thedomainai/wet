try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const path = require('path');
const { colorPalettes, generateCSSVariables, getStatusClass } = require('./colors');
const db = require('./db');
const markdownSync = require('./markdown-sync');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory fallback for development without Supabase
const localData = {
  users: {},
  tasks: {},
  projects: {},
};

function getLocalTasks(userId) {
  return localData.tasks[userId] || [];
}

function saveLocalTask(userId, task) {
  if (!localData.tasks[userId]) localData.tasks[userId] = [];
  const existing = localData.tasks[userId].findIndex(t => t.id === task.id);
  if (existing >= 0) {
    localData.tasks[userId][existing] = task;
  } else {
    localData.tasks[userId].push(task);
  }
}

function getLocalProjects(userId) {
  return localData.projects[userId] || [];
}

// Session management
const sessions = {};
function getSession(req) { return sessions[req.query.session] || null; }

// Date helpers
function getToday() { return new Date().toISOString().split('T')[0]; }
function isToday(dateStr) { return dateStr === getToday(); }
function isFuture(dateStr) { return dateStr > getToday(); }
function isPast(dateStr) { return dateStr < getToday(); }

// HTML Template
function htmlTemplate(title, content, session = null, theme = 'night', bottomNav = null) {
  const cssVars = generateCSSVariables(theme);
  const nav = session ? `
    <nav>
      <a href="/app?session=${session.id}" class="nav-title">AGI Task Manager</a>
      <a href="/app/settings?session=${session.id}" class="nav-settings">Settings</a>
    </nav>` : '';
  const bottom = bottomNav || '';
  
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  ${cssVars}
  --font-mono: 'Roboto Mono', monospace;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --shadow-subtle: 0 1px 2px rgba(0,0,0,0.1);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font-mono);
  background: var(--bg);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
  font-weight: 400;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.container { max-width: 640px; margin: 0 auto; padding: 24px 20px; }

/* Navigation */
nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 32px;
}
.nav-title {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition);
}
.nav-title:hover { color: var(--text-primary); }
.nav-settings {
  color: var(--text-secondary);
  font-size: 13px;
  opacity: 0.7;
  transition: opacity var(--transition);
}
.nav-settings:hover { opacity: 1; }

/* Tab Navigation - NOW as hero */
.tab-nav {
  display: flex;
  align-items: baseline;
  gap: 24px;
  margin-bottom: 32px;
}
.tab-nav a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition);
}
.tab-nav a:hover { color: var(--text-primary); }
.tab-nav a.home {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  line-height: 1;
}
.tab-nav .sub-nav {
  display: flex;
  gap: 6px;
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
}
.tab-nav .sub-nav a {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  opacity: 0.6;
}
.tab-nav .sub-nav a:hover {
  opacity: 1;
  background: var(--card-bg);
}
.tab-nav .sub-nav a.active {
  color: var(--text-primary);
  background: var(--card-bg);
  opacity: 1;
}
.tab-nav .count {
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.6;
  margin-left: 2px;
}

/* Links */
a { color: var(--text-primary); text-decoration: none; }
a:hover { color: var(--link-hover); }

/* Typography */
h1 { font-weight: 600; font-size: 24px; letter-spacing: -0.02em; margin: 16px 0; }
h2 { font-weight: 500; font-size: 18px; letter-spacing: -0.01em; margin: 12px 0; }
h3 { color: var(--text-secondary); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 8px 0; }

/* Form Elements */
input, textarea, select {
  font-family: var(--font-mono);
  background: transparent;
  color: var(--text-primary);
  border: none;
  padding: 8px 0;
  font-size: 13px;
  transition: color var(--transition);
}
input:focus, textarea:focus, select:focus {
  outline: none;
}
input::placeholder, textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.4;
}
button {
  font-family: var(--font-mono);
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  transition: all var(--transition);
}
button:hover {
  background: var(--card-bg);
  border-color: var(--text-secondary);
}

/* Task List */
.task-list { margin: 0; }
.task-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  transition: background var(--transition);
}

/* Custom Checkbox */
.task-checkbox-wrapper {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.task-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition);
  background: transparent;
  margin: 0;
}
.task-checkbox:hover {
  border-color: var(--text-primary);
  background: rgba(255,255,255,0.03);
}
.task-checkbox:checked {
  background: var(--text-secondary);
  border-color: var(--text-secondary);
}
.task-checkbox:checked::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: var(--bg);
  font-weight: 600;
}

/* Task Content */
.task-content { flex: 1; min-width: 0; }
.task-name {
  display: block;
  font-size: 15px;
  font-weight: 400;
  color: var(--text-primary);
  text-decoration: none;
  transition: color var(--transition);
  line-height: 1.4;
}
.task-name:hover { color: var(--text-secondary); }
.task-name.done {
  text-decoration: line-through;
  color: var(--text-secondary);
  opacity: 0.5;
}

/* Task Meta */
.task-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
  min-height: 28px;
}
.task-date {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.7;
}
.task-date.overdue {
  color: var(--alert);
  opacity: 1;
}

/* Task Actions */
.task-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition);
}
.task-item:hover .task-actions { opacity: 1; }
.task-action-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: all var(--transition);
}
.task-action-btn:hover {
  background: var(--card-bg);
  border-color: var(--border);
  color: var(--text-primary);
}
.bring-forward-form { position: relative; display: inline-flex; }
.bring-forward-form input[type="date"] {
  position: absolute;
  opacity: 0;
  width: 28px;
  height: 28px;
  cursor: pointer;
  top: 0;
  left: 0;
}
.bring-forward-form input[type="date"]::-webkit-calendar-picker-indicator {
  position: absolute;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

/* View Switcher */
.view-switcher {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  font-size: 12px;
}
.view-switcher a {
  color: var(--text-secondary);
  text-decoration: none;
  opacity: 0.5;
  transition: all var(--transition);
}
.view-switcher a:hover {
  opacity: 0.8;
}
.view-switcher a.active {
  color: var(--text-primary);
  opacity: 1;
}

/* Date Groups */
.date-group { margin-top: 32px; }
.date-group:first-child { margin-top: 0; }
.date-label {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 12px;
  opacity: 0.6;
}

/* Add Task Form */
.add-task-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 40px;
  font-size: 13px;
}
.add-task-prompt {
  color: var(--text-secondary);
  user-select: none;
}
.add-task-input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-primary);
}
.add-task-input:focus {
  outline: none;
}
.add-task-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.4;
}
.add-task-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--text-secondary);
  font-size: 12px;
}
.add-task-date,
.add-task-project {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 0;
  font-size: 12px;
  transition: color var(--transition);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.add-task-date:hover,
.add-task-project:hover {
  color: var(--text-primary);
}
.add-task-date:focus,
.add-task-project:focus {
  outline: none;
  color: var(--text-primary);
}

/* Done Section */
.done-section {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
.done-section .date-label { opacity: 0.4; }
.done-section .task-item { opacity: 0.4; }
.done-section:hover .task-item { opacity: 0.6; }

/* Empty State */
.empty-state {
  color: var(--text-secondary);
  padding: 64px 24px;
  text-align: center;
  opacity: 0.5;
  font-size: 14px;
}

/* Utility Classes */
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; margin: 12px 0; }
.status-badge { display: inline-block; padding: 2px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-radius: var(--radius-sm); }
/* CLI Add Form */
.cli-add-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
  font-size: 13px;
}
.cli-prompt {
  color: var(--text-secondary);
  user-select: none;
}
.cli-cmd {
  color: var(--text-secondary);
}
.cli-inline-input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 8px 0;
  font-size: 13px;
  flex: 1;
}
.cli-inline-input:focus {
  outline: none;
}
.cli-inline-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.4;
}
.project-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.project-delete { color: var(--text-secondary); font-size: 12px; margin-left: 8px; opacity: 0.5; transition: all var(--transition); }
.project-delete:hover { color: var(--alert); opacity: 1; }
.error { color: var(--alert); }
.form-group { margin: 16px 0; }
.form-group label { display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.form-row { display: flex; gap: 12px; align-items: flex-end; }
.flex { display: flex; } .gap-10 { gap: 10px; } .gap-20 { gap: 20px; }
.mt-10 { margin-top: 10px; } .mt-20 { margin-top: 20px; }
.text-secondary { color: var(--text-secondary); }
.text-small { font-size: 12px; }
details summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; }
.optional-fields { padding: 12px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-top: 8px; }
.count-badge { background: var(--card-bg); padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 4px; }

/* CLI Style */
.cli-container {
  max-width: 520px;
  margin: 0 auto;
  padding: 48px 24px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.cli-header {
  margin-bottom: 32px;
}
.cli-title {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.cli-welcome {
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}
.cli-desc {
  color: var(--text-secondary);
  font-size: 14px;
}
.cli-form {
  margin-top: 32px;
}
.cli-line {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  font-family: var(--font-mono);
  font-size: 14px;
}
.cli-prompt {
  color: var(--text-secondary);
  margin-right: 12px;
  user-select: none;
}
.cli-label {
  color: var(--text-secondary);
  min-width: 100px;
}
.cli-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 0;
  margin-left: 8px;
}
.cli-input:focus {
  outline: none;
}
.cli-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.4;
}
.cli-actions {
  margin-top: 32px;
  display: flex;
  align-items: center;
  gap: 24px;
}
.cli-submit {
  font-family: var(--font-mono);
  background: var(--text-primary);
  color: var(--bg);
  border: none;
  padding: 10px 24px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity var(--transition);
}
.cli-submit:hover {
  opacity: 0.8;
}
.cli-link {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-secondary);
}
.cli-link:hover {
  color: var(--text-primary);
}
.cli-error {
  font-family: var(--font-mono);
  color: var(--alert);
  font-size: 13px;
  margin-bottom: 24px;
  padding: 12px;
  border: 1px solid var(--alert);
  opacity: 0.9;
}
.cli-success {
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-size: 13px;
}
.cli-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--text-primary);
  margin-left: 2px;
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style></head><body><div class="container">${nav}${content}${bottom}</div></body></html>`;
}

// Minimal task add form with CLI style
function minimalTaskAdd(sessionId, projects = [], defaultDate = '') {
  const projectOptions = projects.map(p => `<option value="${p}">${p}</option>`).join('');
  const dateDisplay = defaultDate || 'date';
  return `
    <form method="POST" action="/app/task/add?session=${sessionId}" class="add-task-form">
      <span class="add-task-prompt">&gt;</span>
      <input type="text" name="name" class="add-task-input" placeholder="new task" required>
      <div class="add-task-meta">
        <label class="add-task-field">
          <input type="date" name="due" value="${defaultDate}" class="add-task-date">
        </label>
        <label class="add-task-field">
          <select name="project" class="add-task-project">
            <option value="">--project</option>
            ${projectOptions}
          </select>
        </label>
      </div>
    </form>`;
}

// Natural language date parser
function parseNaturalDate(text) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const lowerText = text.toLowerCase();

  // English day names
  const dayMap = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6,
    'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6
  };

  // Check for relative dates
  if (lowerText.includes('today')) {
    return { date: getToday(), clean: text.replace(/today/gi, '').trim() };
  }
  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { date: tomorrow.toISOString().split('T')[0], clean: text.replace(/tomorrow/gi, '').trim() };
  }

  // Check for day of week
  for (const [dayName, dayNum] of Object.entries(dayMap)) {
    if (lowerText.includes(dayName)) {
      let daysUntil = dayNum - dayOfWeek;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return { date: targetDate.toISOString().split('T')[0], clean: text.replace(new RegExp(dayName, 'gi'), '').trim() };
    }
  }

  // Check for MM/DD or M/D format
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    const targetDate = new Date(today.getFullYear(), month, day);
    if (targetDate < today) targetDate.setFullYear(targetDate.getFullYear() + 1);
    return { date: targetDate.toISOString().split('T')[0], clean: text.replace(/\d{1,2}\/\d{1,2}/, '').trim() };
  }

  return { date: null, clean: text };
}

// Parse @project from text
function parseProject(text, projects) {
  const match = text.match(/@(\S+)/);
  if (match) {
    const projectName = match[1];
    // Check if project exists or create reference
    return { project: projectName, clean: text.replace(/@\S+/, '').trim() };
  }
  return { project: null, clean: text };
}

// Minimal task item
function minimalTaskItem(task, sessionId) {
  const isDone = task.status === 'done';
  const isOverdue = task.due && isPast(task.due) && !isDone;
  const dateDisplay = task.due ? formatShortDate(task.due) : '';

  // Bring forward action (only show for non-done tasks)
  const bringForwardAction = !isDone ? `
    <form method="POST" action="/app/task/${task.id}/bring-forward?session=${sessionId}" class="bring-forward-form">
      <button type="button" class="task-action-btn" title="Bring forward">↑</button>
      <input type="date" name="new_date" onchange="this.form.submit()">
    </form>` : '';

  return `
    <div class="task-item">
      <form method="POST" action="/app/task/${task.id}/toggle?session=${sessionId}" class="task-checkbox-wrapper">
        <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} onchange="this.form.submit()">
      </form>
      <div class="task-content">
        <a href="/app/task/${task.id}?session=${sessionId}" class="task-name ${isDone ? 'done' : ''}">${task.name}</a>
      </div>
      <div class="task-meta">
        ${dateDisplay ? `<span class="task-date ${isOverdue ? 'overdue' : ''}">${dateDisplay}</span>` : ''}
        <div class="task-actions">
          ${bringForwardAction}
        </div>
      </div>
    </div>`;
}

// Format date as short (1/5, tomorrow, etc)
function formatShortDate(dateStr) {
  const today = getToday();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  if (dateStr === today) return '';
  if (dateStr === tomorrowStr) return 'tomorrow';

  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Format date label
function formatDateLabel(dateStr) {
  const today = getToday();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  if (dateStr === today) return 'TODAY';
  if (dateStr === tomorrowStr) return 'TOMORROW';
  if (dateStr < today) return 'OVERDUE';

  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

// Tab navigation
function tabNav(sessionId, inboxCount, projectCount, current = 'now') {
  return `
    <div class="tab-nav">
      <a href="/app?session=${sessionId}" class="home ${current === 'now' ? 'active' : ''}">NOW</a>
      <div class="sub-nav">
        <a href="/app/inbox?session=${sessionId}" class="${current === 'inbox' ? 'active' : ''}">inbox${inboxCount > 0 ? ` <span class="count">(${inboxCount})</span>` : ''}</a>
        <a href="/app/projects?session=${sessionId}" class="${current === 'projects' ? 'active' : ''}">projects${projectCount > 0 ? ` <span class="count">(${projectCount})</span>` : ''}</a>
      </div>
    </div>`;
}

// Helper to get nav counts
function getNavCounts(userId) {
  const tasks = getLocalTasks(userId);
  const projects = getLocalProjects(userId);
  // inboxCount now shows all active tasks (master DB)
  const inboxCount = tasks.filter(t => t.status !== 'done' && t.status !== 'wont_do').length;
  const projectCount = projects.length;
  return { inboxCount, projectCount };
}

// Routes
app.get('/', (req, res) => {
  res.send(htmlTemplate('AGI Task Manager', `
    <div class="cli-container">
      <div class="cli-header">
        <div class="cli-title">$ agi-task-manager --version 1.0.0</div>
        <div class="cli-welcome" style="font-size: 28px; margin-top: 16px;">Subtraction-first task management</div>
        <div class="cli-desc" style="margin-top: 8px;">Task management for the AGI era</div>
      </div>
      <div class="cli-form">
        <div class="cli-line" style="margin-bottom: 16px;">
          <span class="cli-prompt">&gt;</span>
          <span style="color: var(--text-secondary);">Ready to start?</span>
        </div>
        <div class="cli-actions" style="margin-top: 24px;">
          <a href="/signup"><button class="cli-submit">Get Started</button></a>
          <a href="/login" class="cli-link">Login</a>
        </div>
      </div>
    </div>`, null));
});

app.get('/signup', (req, res) => {
  const error = req.query.error;
  res.send(htmlTemplate('Sign Up', `
    <div class="cli-container">
      <div class="cli-header">
        <div class="cli-title">$ create-account</div>
        <div class="cli-welcome">Create your account</div>
        <div class="cli-desc">Enter your credentials to get started</div>
      </div>
      ${error ? `<div class="cli-error">error: ${error}</div>` : ''}
      <form method="POST" action="/signup" class="cli-form">
        <div class="cli-line">
          <span class="cli-prompt">&gt;</span>
          <span class="cli-label">username</span>
          <input type="text" name="username" class="cli-input" placeholder="enter username" required autofocus>
        </div>
        <div class="cli-line">
          <span class="cli-prompt">&gt;</span>
          <span class="cli-label">password</span>
          <input type="password" name="password" class="cli-input" placeholder="enter password" required>
        </div>
        <div class="cli-actions">
          <button type="submit" class="cli-submit">Create Account</button>
          <a href="/login" class="cli-link">Already have an account?</a>
        </div>
      </form>
    </div>`, null));
});

app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  // For development without Supabase
  if (!db.getSupabase()) {
    if (localData.users[username]) {
      return res.redirect(`/signup?error=${encodeURIComponent('username already exists')}`);
    }
    localData.users[username] = { password, theme: 'night' };
    const sessionId = Math.random().toString(36).substring(7);
    sessions[sessionId] = { id: sessionId, username, userId: username };
    return res.redirect(`/app?session=${sessionId}`);
  }

  // TODO: Implement Supabase auth
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const error = req.query.error;
  res.send(htmlTemplate('Login', `
    <div class="cli-container">
      <div class="cli-header">
        <div class="cli-title">$ login</div>
        <div class="cli-welcome">Welcome back</div>
        <div class="cli-desc">Enter your credentials to continue</div>
      </div>
      ${error ? `<div class="cli-error">error: ${error}</div>` : ''}
      <form method="POST" action="/login" class="cli-form">
        <div class="cli-line">
          <span class="cli-prompt">&gt;</span>
          <span class="cli-label">username</span>
          <input type="text" name="username" class="cli-input" placeholder="enter username" required autofocus>
        </div>
        <div class="cli-line">
          <span class="cli-prompt">&gt;</span>
          <span class="cli-label">password</span>
          <input type="password" name="password" class="cli-input" placeholder="enter password" required>
        </div>
        <div class="cli-actions">
          <button type="submit" class="cli-submit">Login</button>
          <a href="/signup" class="cli-link">Create an account</a>
        </div>
      </form>
    </div>`, null));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!db.getSupabase()) {
    if (!localData.users[username] || localData.users[username].password !== password) {
      return res.redirect(`/login?error=${encodeURIComponent('invalid credentials')}`);
    }
    const sessionId = Math.random().toString(36).substring(7);
    sessions[sessionId] = { id: sessionId, username, userId: username };
    return res.redirect(`/app?session=${sessionId}`);
  }

  res.redirect('/');
});

app.get('/logout', (req, res) => {
  if (req.query.session) delete sessions[req.query.session];
  res.redirect('/');
});

// Main app - NOW view with grouped tasks
app.get('/app', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  const today = getToday();
  const { inboxCount, projectCount } = getNavCounts(session.userId);

  // Get tasks for today and overdue (active tasks with due <= today)
  const activeTasks = allTasks.filter(t =>
    t.status !== 'done' && t.status !== 'wont_do' && t.due && t.due <= today
  );

  // Group by date
  const grouped = {};
  activeTasks.forEach(task => {
    const label = formatDateLabel(task.due);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(task);
  });

  // Build HTML for groups (OVERDUE first, then TODAY)
  const order = ['OVERDUE', 'TODAY'];
  let tasksHtml = '';
  order.forEach(label => {
    if (grouped[label] && grouped[label].length > 0) {
      tasksHtml += `<div class="date-group"><div class="date-label">${label}</div>`;
      grouped[label].forEach(task => {
        tasksHtml += minimalTaskItem(task, session.id);
      });
      tasksHtml += '</div>';
    }
  });

  // Done today
  const doneToday = allTasks.filter(t => t.completedAt && t.completedAt.startsWith(today));
  let doneHtml = '';
  if (doneToday.length > 0) {
    doneHtml = `<div class="done-section">`;
    doneToday.forEach(task => {
      doneHtml += minimalTaskItem(task, session.id);
    });
    doneHtml += '</div>';
  }

  const content = `
    ${tabNav(session.id, inboxCount, projectCount, 'now')}
    ${minimalTaskAdd(session.id, projects, today)}
    ${tasksHtml || '<div class="empty-state">No tasks for today</div>'}
    ${doneHtml}
  `;

  res.send(htmlTemplate('NOW', content, session, theme));
});

// Redirect /app/now to /app
app.get('/app/now', (req, res) => {
  res.redirect(`/app?session=${req.query.session}`);
});

// PROJECT - Tasks grouped by project
app.get('/app/projects', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  const { inboxCount, projectCount } = getNavCounts(session.userId);

  // Group tasks by project
  const tasksByProject = {};
  projects.forEach(p => { tasksByProject[p] = []; });

  allTasks.filter(t => t.status !== 'done' && t.status !== 'wont_do' && t.project).forEach(task => {
    if (!tasksByProject[task.project]) tasksByProject[task.project] = [];
    tasksByProject[task.project].push(task);
  });

  // Project add form
  const addForm = `
    <form method="POST" action="/app/project/add?session=${session.id}" class="cli-add-form">
      <span class="cli-prompt">&gt;</span>
      <span class="cli-cmd">add-project</span>
      <input type="text" name="name" class="cli-inline-input" placeholder="name" required>
    </form>`;

  // Build projects HTML - show all projects including empty ones
  let projectsHtml = '';
  projects.forEach(project => {
    const tasks = tasksByProject[project] || [];
    const taskCount = tasks.length;
    projectsHtml += `<div class="date-group">
      <div class="project-header">
        <span class="date-label">${project} ${taskCount > 0 ? `(${taskCount})` : ''}</span>
        <a href="/app/project/delete/${encodeURIComponent(project)}?session=${session.id}" class="project-delete" onclick="return confirm('Delete project ${project}?')">delete</a>
      </div>`;
    tasks.forEach(task => {
      projectsHtml += minimalTaskItem(task, session.id);
    });
    if (tasks.length === 0) {
      projectsHtml += '<div class="text-secondary text-small" style="padding: 8px 0;">No tasks</div>';
    }
    projectsHtml += '</div>';
  });

  const content = `
    ${tabNav(session.id, inboxCount, projectCount, 'projects')}
    ${addForm}
    ${projectsHtml || '<div class="empty-state">Add a project to get started</div>'}
  `;
  res.send(htmlTemplate('PROJECT', content, session, theme));
});

// INBOX - Master task database with view switching
app.get('/app/inbox', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const view = req.query.view || 'date'; // 'date' or 'project'
  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId).filter(t => t.status !== 'done' && t.status !== 'wont_do');
  const projects = getLocalProjects(session.userId);
  const { inboxCount, projectCount } = getNavCounts(session.userId);

  // View switcher
  const viewSwitcher = `
    <div class="view-switcher">
      <a href="/app/inbox?session=${session.id}&view=date" class="${view === 'date' ? 'active' : ''}">by date</a>
      <a href="/app/inbox?session=${session.id}&view=project" class="${view === 'project' ? 'active' : ''}">by project</a>
    </div>`;

  let tasksHtml = '';

  if (view === 'project') {
    // Group by project
    const tasksByProject = { '_none': [] };
    projects.forEach(p => { tasksByProject[p] = []; });

    allTasks.forEach(task => {
      const proj = task.project || '_none';
      if (!tasksByProject[proj]) tasksByProject[proj] = [];
      tasksByProject[proj].push(task);
    });

    // No project first
    if (tasksByProject['_none'].length > 0) {
      tasksHtml += `<div class="date-group"><div class="date-label">No project</div>`;
      tasksByProject['_none'].forEach(task => {
        tasksHtml += minimalTaskItem(task, session.id);
      });
      tasksHtml += '</div>';
    }

    // Then by project
    projects.forEach(project => {
      const tasks = tasksByProject[project] || [];
      if (tasks.length > 0) {
        tasksHtml += `<div class="date-group"><div class="date-label">${project}</div>`;
        tasks.forEach(task => {
          tasksHtml += minimalTaskItem(task, session.id);
        });
        tasksHtml += '</div>';
      }
    });
  } else {
    // Group by date (default)
    const noDate = allTasks.filter(t => !t.due);
    const withDate = allTasks.filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due));

    // No date first
    if (noDate.length > 0) {
      tasksHtml += `<div class="date-group"><div class="date-label">No date</div>`;
      noDate.forEach(task => {
        tasksHtml += minimalTaskItem(task, session.id);
      });
      tasksHtml += '</div>';
    }

    // Group dated tasks
    const grouped = {};
    withDate.forEach(task => {
      const label = formatDateLabel(task.due);
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(task);
    });

    Object.entries(grouped).forEach(([label, tasks]) => {
      tasksHtml += `<div class="date-group"><div class="date-label">${label}</div>`;
      tasks.forEach(task => {
        tasksHtml += minimalTaskItem(task, session.id);
      });
      tasksHtml += '</div>';
    });
  }

  const content = `
    ${tabNav(session.id, inboxCount, projectCount, 'inbox')}
    ${minimalTaskAdd(session.id, projects)}
    ${viewSwitcher}
    ${tasksHtml || '<div class="empty-state">No tasks</div>'}
  `;

  res.send(htmlTemplate('INBOX', content, session, theme));
});

// Redirect /app/later to /app/inbox
app.get('/app/later', (req, res) => {
  res.redirect(`/app/inbox?session=${req.query.session}`);
});

// Redirect old routes
app.get('/app/upcoming', (req, res) => {
  res.redirect(`/app/later?session=${req.query.session}`);
});

// Add task with natural language parsing
app.post('/app/task/add', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  let { name, due, project } = req.body;
  if (!name?.trim()) return res.redirect(req.get('Referer') || `/app?session=${session.id}`);

  // Parse natural language only if due/project not explicitly provided
  let taskName = name.trim();
  let taskDue = due || null;
  let taskProject = project || null;

  if (!taskDue) {
    const dateResult = parseNaturalDate(taskName);
    taskDue = dateResult.date;
    taskName = dateResult.clean;
  }

  if (!taskProject) {
    const projectResult = parseProject(taskName);
    taskProject = projectResult.project;
    taskName = projectResult.clean;
  }

  const task = {
    id: Date.now().toString(),
    name: taskName.trim(),
    due: taskDue,
    project: taskProject,
    status: 'todo',
    estimate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    history: [{ action: 'created', timestamp: new Date().toISOString() }]
  };

  // Auto-create project if it doesn't exist
  if (taskProject) {
    const projects = getLocalProjects(session.userId);
    if (!projects.includes(taskProject)) {
      if (!localData.projects[session.userId]) localData.projects[session.userId] = [];
      localData.projects[session.userId].push(taskProject);
    }
  }

  saveLocalTask(session.userId, task);
  markdownSync.syncToMarkdown(getLocalTasks(session.userId));

  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Toggle task
app.post('/app/task/:id/toggle', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const tasks = getLocalTasks(session.userId);
  const task = tasks.find(t => t.id === req.params.id);
  
  if (task) {
    if (task.status === 'done') {
      task.status = 'todo';
      task.completedAt = null;
      task.history.push({ action: 'uncompleted', timestamp: new Date().toISOString() });
    } else {
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      task.history.push({ action: 'completed', timestamp: new Date().toISOString() });
    }
    task.updatedAt = new Date().toISOString();
    saveLocalTask(session.userId, task);
    markdownSync.syncToMarkdown(tasks);
  }
  
  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Defer task - change due date to later
app.post('/app/task/:id/defer', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const { defer_date } = req.body;
  const tasks = getLocalTasks(session.userId);
  const task = tasks.find(t => t.id === req.params.id);

  if (task && defer_date) {
    task.history.push({ action: 'due_change', type: 'defer', from: task.due, to: defer_date, timestamp: new Date().toISOString() });
    task.due = defer_date;
    task.updatedAt = new Date().toISOString();
    saveLocalTask(session.userId, task);
    markdownSync.syncToMarkdown(tasks);
  }

  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Bring forward task - change due date to earlier
app.post('/app/task/:id/bring-forward', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const { new_date } = req.body;
  const tasks = getLocalTasks(session.userId);
  const task = tasks.find(t => t.id === req.params.id);

  if (task && new_date) {
    task.history.push({ action: 'due_change', type: 'bring_forward', from: task.due, to: new_date, timestamp: new Date().toISOString() });
    task.due = new_date;
    task.updatedAt = new Date().toISOString();
    saveLocalTask(session.userId, task);
    markdownSync.syncToMarkdown(tasks);
  }

  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Change task status
app.post('/app/task/:id/status', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const { status } = req.body;
  const tasks = getLocalTasks(session.userId);
  const task = tasks.find(t => t.id === req.params.id);

  if (task && status) {
    task.history.push({ action: 'status_change', from: task.status, to: status, timestamp: new Date().toISOString() });
    if (status === 'done') {
      task.completedAt = new Date().toISOString();
    } else if (task.status === 'done') {
      task.completedAt = null;
    }
    task.status = status;
    task.updatedAt = new Date().toISOString();
    saveLocalTask(session.userId, task);
    markdownSync.syncToMarkdown(tasks);
  }

  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Task detail
app.get('/app/task/:id', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const theme = localData.users[session.userId]?.theme || 'night';
  const tasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  const task = tasks.find(t => t.id === req.params.id);

  if (!task) return res.redirect(`/app?session=${session.id}`);

  // Capture referrer for return navigation (exclude task detail pages)
  const referer = req.get('Referer') || '';
  const returnTo = referer && !referer.includes('/app/task/') ? referer : `/app?session=${session.id}`;

  const projectOptions = projects.map(p => `<option value="${p}" ${task.project === p ? 'selected' : ''}>${p}</option>`).join('');
  const statusOptions = [['todo','ToDo'],['in_progress','In Progress'],['waiting','Waiting'],['done','Done'],['wont_do',"Won't Do"]]
    .map(([v,l]) => `<option value="${v}" ${task.status === v ? 'selected' : ''}>${l}</option>`).join('');
  const estimateOptions = ['','0.5','1','1.5','2','3','4','8']
    .map(v => `<option value="${v}" ${(task.estimate?.toString() || '') === v ? 'selected' : ''}>${v ? v + 'h' : '-'}</option>`).join('');

  const historyHtml = task.history.map(h =>
    `<li class="text-small text-secondary">${h.timestamp.split('T')[0]} - ${h.action}${h.type ? ` (${h.type})` : ''}</li>`
  ).join('');

  res.send(htmlTemplate(`Task: ${task.name}`, `
    <h1>Edit Task</h1>
    <form method="POST" action="/app/task/${task.id}/update?session=${session.id}" class="card">
      <input type="hidden" name="return_to" value="${returnTo}">
      <div class="form-group"><label>Task Name</label><input type="text" name="name" value="${task.name}" required style="width: 100%;"></div>
      <div class="form-row">
        <div class="form-group"><label>Due Date</label><input type="date" name="due" value="${task.due || ''}" style="width: 150px;"></div>
        <div class="form-group"><label><input type="checkbox" name="is_defer" value="1" style="width: auto; margin-right: 5px;">Mark as deferred</label></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Project</label><select name="project" style="width: 150px;"><option value="">None</option>${projectOptions}</select></div>
        <div class="form-group"><label>Status</label><select name="status" style="width: 130px;">${statusOptions}</select></div>
        <div class="form-group"><label>Estimate</label><select name="estimate" style="width: 100px;">${estimateOptions}</select></div>
      </div>
      <div class="flex gap-10 mt-10">
        <button type="submit">Save</button>
        <a href="${returnTo}"><button type="button">Cancel</button></a>
        <a href="/app/task/${task.id}/delete?session=${session.id}" onclick="return confirm('Delete?')"><button type="button" style="border-color: var(--alert); color: var(--alert);">Delete</button></a>
      </div>
    </form>
    <h3 class="mt-20">History</h3>
    <ul class="card" style="padding-left: 30px;">${historyHtml}</ul>
  `, session, theme));
});

// Update task
app.post('/app/task/:id/update', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const { name, due, project, status, estimate, is_defer, return_to } = req.body;
  const tasks = getLocalTasks(session.userId);
  const task = tasks.find(t => t.id === req.params.id);

  if (task) {
    if (task.due !== (due || null)) {
      const changeType = is_defer ? 'defer' : 'edit';
      task.history.push({ action: 'due_change', type: changeType, from: task.due, to: due || null, timestamp: new Date().toISOString() });
    }
    if (task.status !== status) {
      task.history.push({ action: 'status_change', from: task.status, to: status, timestamp: new Date().toISOString() });
      if (status === 'done') task.completedAt = new Date().toISOString();
      else if (task.status === 'done') task.completedAt = null;
    }

    task.name = name;
    task.due = due || null;
    task.project = project || null;
    task.status = status;
    task.estimate = estimate ? parseFloat(estimate) : null;
    task.updatedAt = new Date().toISOString();

    saveLocalTask(session.userId, task);
    markdownSync.syncToMarkdown(tasks);
  }

  // Return to previous page or default to /app
  res.redirect(return_to || `/app?session=${session.id}`);
});

// Delete task
app.get('/app/task/:id/delete', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  localData.tasks[session.userId] = getLocalTasks(session.userId).filter(t => t.id !== req.params.id);
  markdownSync.syncToMarkdown(localData.tasks[session.userId]);
  
  res.redirect(`/app?session=${session.id}`);
});

// Settings
app.get('/app/settings', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const theme = localData.users[session.userId]?.theme || 'night';
  const projects = getLocalProjects(session.userId);
  
  const projectList = projects.length > 0
    ? projects.map(p => `<li>${p} <a href="/app/project/delete/${encodeURIComponent(p)}?session=${session.id}" class="text-small">[delete]</a></li>`).join('')
    : '<li class="text-secondary">No projects</li>';
  
  res.send(htmlTemplate('Settings', `
    <h1>Settings</h1>
    <h3 class="mt-20">Theme</h3>
    <form method="POST" action="/app/settings/theme?session=${session.id}" class="card">
      <div class="flex gap-20">
        <label style="cursor: pointer;"><input type="radio" name="theme" value="night" ${theme === 'night' ? 'checked' : ''}> Night</label>
        <label style="cursor: pointer;"><input type="radio" name="theme" value="basic" ${theme === 'basic' ? 'checked' : ''}> Basic</label>
      </div>
      <button type="submit" class="mt-10">Save Theme</button>
    </form>
    <h3 class="mt-20">Projects</h3>
    <div class="card">
      <ul style="padding-left: 20px;">${projectList}</ul>
      <form method="POST" action="/app/project/add?session=${session.id}" class="mt-10 flex gap-10">
        <input type="text" name="name" placeholder="New project name" required>
        <button type="submit">Add Project</button>
      </form>
    </div>
    <h3 class="mt-20">Sync to Markdown</h3>
    <div class="card">
      <p class="text-secondary text-small">Export tasks to Markdown files</p>
      <a href="/app/sync?session=${session.id}"><button class="mt-10">Sync Now</button></a>
    </div>
    <h3 class="mt-20">Account</h3>
    <div class="card">
      <a href="/logout?session=${session.id}"><button style="border-color: var(--alert); color: var(--alert);">Logout</button></a>
    </div>
  `, session, theme));
});

app.post('/app/settings/theme', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  if (localData.users[session.userId]) {
    localData.users[session.userId].theme = req.body.theme || 'night';
  }
  res.redirect(`/app/settings?session=${session.id}`);
});

app.post('/app/project/add', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const { name } = req.body;
  if (name?.trim()) {
    if (!localData.projects[session.userId]) localData.projects[session.userId] = [];
    if (!localData.projects[session.userId].includes(name.trim())) {
      localData.projects[session.userId].push(name.trim());
    }
  }
  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

app.get('/app/project/delete/:name', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  if (localData.projects[session.userId]) {
    localData.projects[session.userId] = localData.projects[session.userId].filter(p => p !== req.params.name);
  }
  res.redirect(req.get('Referer') || `/app?session=${session.id}`);
});

// Sync endpoint
app.get('/app/sync', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const tasks = getLocalTasks(session.userId);
  markdownSync.syncToMarkdown(tasks);
  
  res.redirect(`/app/settings?session=${session.id}`);
});

// API for testing
app.get('/api/data/clear', (req, res) => {
  Object.keys(localData).forEach(k => localData[k] = {});
  Object.keys(sessions).forEach(k => delete sessions[k]);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = app;
