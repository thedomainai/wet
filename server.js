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
<html><head><meta charset="UTF-8"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Parisienne&family=Playfair+Display:wght@400;500;600&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root { 
  ${cssVars}
  --font-sans: 'Roboto', sans-serif;
  --font-serif: 'Playfair Display', serif;
  --font-script: 'Parisienne', cursive;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-sans); background: var(--bg); color: var(--text-primary); padding: 20px; padding-bottom: 80px; line-height: 1.6; min-height: 100vh; font-weight: 300; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-bottom: 20px; }
.nav-title { font-family: var(--font-script); font-size: 22px; color: var(--text-primary); text-decoration: none; }
.nav-settings { color: var(--text-secondary); font-size: 13px; }
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg); border-top: 1px solid var(--border); padding: 12px 20px; display: flex; justify-content: center; gap: 20px; font-size: 13px; }
.bottom-nav a { color: var(--text-secondary); text-decoration: none; }
.bottom-nav a:hover, .bottom-nav a.active { color: var(--text-primary); }
.bottom-nav .count { opacity: 0.6; }
a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); }
h1 { margin: 20px 0; font-family: var(--font-serif); font-weight: 500; font-size: 28px; }
h2 { margin: 15px 0; font-family: var(--font-serif); font-weight: 500; font-size: 20px; }
h3 { margin: 12px 0; color: var(--text-secondary); font-weight: 400; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
input, textarea, select { font-family: var(--font-sans); background: var(--input-bg); color: var(--text-primary); border: 1px solid var(--input-border); padding: 8px 12px; margin: 5px 0; font-size: 14px; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--border-hover); }
button { font-family: var(--font-sans); background: var(--btn-bg); color: var(--btn-text); border: 1px solid var(--border); padding: 8px 16px; cursor: pointer; font-size: 14px; }
button:hover { background: var(--btn-bg-hover); color: var(--btn-text-hover); }
.status-badge { display: inline-block; padding: 2px 8px; font-size: 11px; text-transform: uppercase; border-radius: 2px; }
.card { background: var(--card-bg); border: 1px solid var(--border); padding: 15px; margin: 10px 0; }
.task-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.task-checkbox { width: 18px; height: 18px; accent-color: var(--status-done); cursor: pointer; flex-shrink: 0; }
.task-name { flex: 1; font-size: 15px; color: var(--text-primary); text-decoration: none; }
.task-name:hover { color: var(--link); }
.task-name.done { text-decoration: line-through; color: var(--text-secondary); opacity: 0.6; }
.task-date { font-size: 12px; color: var(--text-secondary); flex-shrink: 0; }
.task-date.overdue { color: var(--alert); }
.date-group { margin-top: 24px; }
.date-group:first-child { margin-top: 0; }
.date-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 8px; }
.add-task-input { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--border); padding: 12px 0; font-size: 15px; color: var(--text-primary); }
.add-task-input:focus { outline: none; border-color: var(--text-secondary); }
.add-task-input::placeholder { color: var(--text-secondary); opacity: 0.6; }
.done-section { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); opacity: 0.5; }
.done-section:hover { opacity: 0.8; }
.error { color: var(--alert); }
.form-group { margin: 15px 0; }
.form-group label { display: block; margin-bottom: 5px; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; }
.form-row { display: flex; gap: 10px; align-items: flex-end; }
.flex { display: flex; } .gap-10 { gap: 10px; } .gap-20 { gap: 20px; }
.mt-10 { margin-top: 10px; } .mt-20 { margin-top: 20px; }
.text-secondary { color: var(--text-secondary); }
.text-small { font-size: 12px; }
details summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; }
.optional-fields { padding: 10px; background: var(--card-bg); border: 1px solid var(--border); margin-top: 5px; }
.count-badge { background: var(--sub); padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-left: 5px; }
.empty-state { color: var(--text-secondary); padding: 40px; text-align: center; }
</style></head><body>${nav}${content}${bottom}</body></html>`;
}

// Task form component
function taskAddForm(sessionId, projects, defaultDue = '') {
  const projectOptions = projects.map(p => `<option value="${p.id || p}">${p.name || p}</option>`).join('');
  return `
    <form method="POST" action="/app/task/add?session=${sessionId}" class="card">
      <div class="form-row">
        <div style="flex: 1;">
          <label class="text-secondary text-small">TASK NAME *</label>
          <input type="text" name="name" placeholder="タスク名を入力" required style="width: 100%;">
        </div>
        <div>
          <label class="text-secondary text-small">DUE DATE</label>
          <input type="date" name="due" value="${defaultDue}" style="width: 150px;">
        </div>
        <button type="submit">Add</button>
      </div>
      <details>
        <summary>More options</summary>
        <div class="optional-fields">
          <div class="form-row">
            <div>
              <label class="text-secondary text-small">PROJECT</label>
              <select name="project" style="width: 150px;"><option value="">None</option>${projectOptions}</select>
            </div>
            <div>
              <label class="text-secondary text-small">STATUS</label>
              <select name="status" style="width: 130px;">
                <option value="todo">ToDo</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
              </select>
            </div>
            <div>
              <label class="text-secondary text-small">ESTIMATE</label>
              <select name="estimate" style="width: 100px;">
                <option value="">-</option>
                <option value="0.5">0.5h</option><option value="1">1h</option>
                <option value="1.5">1.5h</option><option value="2">2h</option>
                <option value="3">3h</option><option value="4">4h</option><option value="8">8h</option>
              </select>
            </div>
          </div>
        </div>
      </details>
    </form>`;
}

// Task list component
function taskList(tasks, sessionId, showDue = true, showDefer = true) {
  if (!tasks || tasks.length === 0) return '<div class="empty-state">No tasks</div>';

  const statusOptions = [
    ['todo', 'ToDo'],
    ['in_progress', 'In Progress'],
    ['waiting', 'Waiting'],
    ['done', 'Done'],
    ['wont_do', "Won't Do"]
  ];

  return tasks.map(task => {
    const isDone = task.status === 'done';
    const isOverdue = task.due && isPast(task.due) && !isDone;

    const statusSelectOptions = statusOptions
      .map(([v, l]) => `<option value="${v}" ${task.status === v ? 'selected' : ''}>${l}</option>`)
      .join('');

    return `
      <div class="task-item">
        <form method="POST" action="/app/task/${task.id}/toggle?session=${sessionId}" style="display: contents;">
          <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} onchange="this.form.submit()">
        </form>
        ${showDefer && !isDone ? `
        <form method="POST" action="/app/task/${task.id}/defer?session=${sessionId}" class="defer-form">
          <button type="button" class="defer-btn" title="棚上げ" onclick="this.nextElementSibling.style.display='inline-block';this.style.display='none';">⏸</button>
          <input type="date" name="defer_date" style="display:none; width: 130px;" onchange="this.form.submit()" onblur="if(!this.value){this.style.display='none';this.previousElementSibling.style.display='inline-block';}">
        </form>` : ''}
        <div style="flex: 1;">
          <a href="/app/task/${task.id}?session=${sessionId}" class="task-name ${isDone ? 'done' : ''}">${task.name}</a>
          <div class="task-meta">
            ${task.project ? `<span>@${task.project}</span>` : ''}
            ${task.estimate ? `<span>${task.estimate}h</span>` : ''}
            ${showDue && task.due ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">${task.due}</span>` : ''}
          </div>
        </div>
        <form method="POST" action="/app/task/${task.id}/status?session=${sessionId}" style="display: contents;">
          <select class="status-select ${getStatusClass(task.status)}" name="status" onchange="this.form.submit()">
            ${statusSelectOptions}
          </select>
        </form>
      </div>`;
  }).join('');
}

// Routes
app.get('/', (req, res) => {
  res.send(htmlTemplate('AGI Task Manager', `
    <div style="max-width: 400px; margin: 100px auto; text-align: center;">
      <h1 style="font-size: 48px; margin-bottom: 10px; font-family: var(--font-script);">AGI Task Manager</h1>
      <p class="text-secondary" style="margin-bottom: 40px;">タスク管理システム for AGI時代</p>
      <div class="flex gap-10" style="justify-content: center;">
        <a href="/login"><button>Login</button></a>
        <a href="/signup"><button>Sign Up</button></a>
      </div>
    </div>`));
});

app.get('/signup', (req, res) => {
  res.send(htmlTemplate('Sign Up', `
    <div style="max-width: 300px; margin: 80px auto;">
      <h1>Sign Up</h1>
      <form method="POST" action="/signup">
        <div class="form-group"><label>Username</label><input type="text" name="username" required style="width: 100%;"></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required style="width: 100%;"></div>
        <button type="submit" style="width: 100%; margin-top: 10px;">Create Account</button>
      </form>
      <p class="mt-20" style="text-align: center;"><a href="/">← Back</a></p>
    </div>`));
});

app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  
  // For development without Supabase
  if (!db.getSupabase()) {
    if (localData.users[username]) {
      return res.send(htmlTemplate('Sign Up Error', `
        <div style="max-width: 300px; margin: 80px auto; text-align: center;">
          <h1>Sign Up</h1><p class="error">Username already exists</p>
          <a href="/signup"><button class="mt-20">Try Again</button></a>
        </div>`));
    }
    localData.users[username] = { password, theme: 'night' };
    const sessionId = Math.random().toString(36).substring(7);
    sessions[sessionId] = { id: sessionId, username, userId: username };
    return res.redirect(`/app/now?session=${sessionId}`);
  }
  
  // TODO: Implement Supabase auth
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send(htmlTemplate('Login', `
    <div style="max-width: 300px; margin: 80px auto;">
      <h1>Login</h1>
      <form method="POST" action="/login">
        <div class="form-group"><label>Username</label><input type="text" name="username" required style="width: 100%;"></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required style="width: 100%;"></div>
        <button type="submit" style="width: 100%; margin-top: 10px;">Login</button>
      </form>
      <p class="mt-20" style="text-align: center;"><a href="/">← Back</a></p>
    </div>`));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!db.getSupabase()) {
    if (!localData.users[username] || localData.users[username].password !== password) {
      return res.send(htmlTemplate('Login Error', `
        <div style="max-width: 300px; margin: 80px auto; text-align: center;">
          <h1>Login</h1><p class="error">Invalid credentials</p>
          <a href="/login"><button class="mt-20">Try Again</button></a>
        </div>`));
    }
    const sessionId = Math.random().toString(36).substring(7);
    sessions[sessionId] = { id: sessionId, username, userId: username };
    return res.redirect(`/app/now?session=${sessionId}`);
  }
  
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  if (req.query.session) delete sessions[req.query.session];
  res.redirect('/');
});

// PROJECT - プロジェクト別タスク一覧
app.get('/app/projects', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');

  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);

  // Group tasks by project
  const tasksByProject = {};
  projects.forEach(p => { tasksByProject[p] = []; });
  tasksByProject['(No Project)'] = [];

  allTasks.filter(t => t.status !== 'done' && t.status !== 'wont_do').forEach(task => {
    const projectKey = task.project || '(No Project)';
    if (!tasksByProject[projectKey]) tasksByProject[projectKey] = [];
    tasksByProject[projectKey].push(task);
  });

  const projectsHtml = Object.entries(tasksByProject)
    .filter(([_, tasks]) => tasks.length > 0)
    .map(([project, tasks]) => `
      <h3 class="mt-20">${project} <span class="count-badge">${tasks.length}</span></h3>
      <div class="card">${taskList(tasks, session.id)}</div>
    `).join('');

  res.send(htmlTemplate('PROJECT', `
    <h1>PROJECT</h1>
    <p class="text-secondary">プロジェクト別タスク一覧</p>
    ${projectsHtml || '<div class="empty-state mt-20">No active tasks</div>'}
  `, session, theme));
});

// INBOX
app.get('/app/inbox', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const theme = localData.users[session.userId]?.theme || 'night';
  const tasks = getLocalTasks(session.userId).filter(t => !t.due && t.status !== 'done' && t.status !== 'wont_do');
  const projects = getLocalProjects(session.userId);
  
  res.send(htmlTemplate('INBOX', `
    <h1>INBOX <span class="count-badge">${tasks.length}</span></h1>
    <p class="text-secondary">期日未設定のタスク</p>
    ${taskAddForm(session.id, projects)}
    <div class="mt-20">${taskList(tasks, session.id, false)}</div>
  `, session, theme));
});

// NOW
app.get('/app/now', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  const today = getToday();
  
  const nowTasks = allTasks.filter(t => t.due === today && t.status !== 'done' && t.status !== 'wont_do');
  const overdueTasks = allTasks.filter(t => t.due && isPast(t.due) && t.status !== 'done' && t.status !== 'wont_do');
  const doneTodayTasks = allTasks.filter(t => t.completedAt && t.completedAt.startsWith(today));
  
  res.send(htmlTemplate('NOW', `
    <h1>NOW <span class="count-badge">${nowTasks.length + overdueTasks.length}</span></h1>
    <p class="text-secondary">今日やること（${today}）</p>
    ${taskAddForm(session.id, projects, today)}
    ${overdueTasks.length > 0 ? `<h3 class="mt-20">Overdue</h3><div class="card" style="border-color: var(--alert);">${taskList(overdueTasks, session.id)}</div>` : ''}
    <h3 class="mt-20">Today</h3>
    <div class="card">${taskList(nowTasks, session.id, false)}</div>
    ${doneTodayTasks.length > 0 ? `<h3 class="mt-20">Done Today</h3><div class="card">${taskList(doneTodayTasks, session.id, false)}</div>` : ''}
  `, session, theme));
});

// UPCOMING
app.get('/app/upcoming', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const theme = localData.users[session.userId]?.theme || 'night';
  const allTasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  
  const upcomingTasks = allTasks
    .filter(t => t.due && isFuture(t.due) && t.status !== 'done' && t.status !== 'wont_do')
    .sort((a, b) => a.due.localeCompare(b.due));
  
  const grouped = {};
  upcomingTasks.forEach(t => {
    if (!grouped[t.due]) grouped[t.due] = [];
    grouped[t.due].push(t);
  });
  
  const groupedHtml = Object.entries(grouped).map(([date, dateTasks]) => `
    <h3 class="mt-20">${date}</h3>
    <div class="card">${taskList(dateTasks, session.id, false)}</div>
  `).join('');
  
  res.send(htmlTemplate('UPCOMING', `
    <h1>UPCOMING <span class="count-badge">${upcomingTasks.length}</span></h1>
    <p class="text-secondary">明日以降のタスク</p>
    ${taskAddForm(session.id, projects)}
    ${groupedHtml || '<div class="empty-state mt-20">No upcoming tasks</div>'}
  `, session, theme));
});

// Add task
app.post('/app/task/add', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const { name, due, project, status, estimate } = req.body;
  if (!name?.trim()) return res.redirect(req.get('Referer') || `/app/inbox?session=${session.id}`);
  
  const task = {
    id: Date.now().toString(),
    name: name.trim(),
    due: due || null,
    project: project || null,
    status: status || 'todo',
    estimate: estimate ? parseFloat(estimate) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    history: [{ action: 'created', timestamp: new Date().toISOString() }]
  };
  
  saveLocalTask(session.userId, task);
  
  // Sync to markdown files
  markdownSync.syncToMarkdown(getLocalTasks(session.userId));
  
  if (!due) res.redirect(`/app/inbox?session=${session.id}`);
  else if (isToday(due)) res.redirect(`/app/now?session=${session.id}`);
  else res.redirect(`/app/upcoming?session=${session.id}`);
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
  
  res.redirect(req.get('Referer') || `/app/now?session=${session.id}`);
});

// Defer task (棚上げ) - change due date
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

  res.redirect(req.get('Referer') || `/app/now?session=${session.id}`);
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

  res.redirect(req.get('Referer') || `/app/now?session=${session.id}`);
});

// Task detail
app.get('/app/task/:id', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const theme = localData.users[session.userId]?.theme || 'night';
  const tasks = getLocalTasks(session.userId);
  const projects = getLocalProjects(session.userId);
  const task = tasks.find(t => t.id === req.params.id);
  
  if (!task) return res.redirect(`/app/now?session=${session.id}`);
  
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
      <div class="form-group"><label>Task Name</label><input type="text" name="name" value="${task.name}" required style="width: 100%;"></div>
      <div class="form-row">
        <div class="form-group"><label>Due Date</label><input type="date" name="due" value="${task.due || ''}" style="width: 150px;"></div>
        <div class="form-group"><label><input type="checkbox" name="is_defer" value="1" style="width: auto; margin-right: 5px;">Defer (棚上げ)</label></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Project</label><select name="project" style="width: 150px;"><option value="">None</option>${projectOptions}</select></div>
        <div class="form-group"><label>Status</label><select name="status" style="width: 130px;">${statusOptions}</select></div>
        <div class="form-group"><label>Estimate</label><select name="estimate" style="width: 100px;">${estimateOptions}</select></div>
      </div>
      <div class="flex gap-10 mt-10">
        <button type="submit">Save Changes</button>
        <a href="/app/task/${task.id}/delete?session=${session.id}" onclick="return confirm('Delete?')"><button type="button" style="border-color: var(--alert); color: var(--alert);">Delete</button></a>
      </div>
    </form>
    <h3 class="mt-20">History</h3>
    <ul class="card" style="padding-left: 30px;">${historyHtml}</ul>
    <p class="mt-20"><a href="javascript:history.back()">← Back</a></p>
  `, session, theme));
});

// Update task
app.post('/app/task/:id/update', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  const { name, due, project, status, estimate, is_defer } = req.body;
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
  
  res.redirect(`/app/task/${req.params.id}?session=${session.id}`);
});

// Delete task
app.get('/app/task/:id/delete', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  localData.tasks[session.userId] = getLocalTasks(session.userId).filter(t => t.id !== req.params.id);
  markdownSync.syncToMarkdown(localData.tasks[session.userId]);
  
  res.redirect(`/app/now?session=${session.id}`);
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
      <p class="text-secondary text-small">タスクデータをMarkdownファイルとして出力します（Cursor連携用）</p>
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
  res.redirect(`/app/settings?session=${session.id}`);
});

app.get('/app/project/delete/:name', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/login');
  
  if (localData.projects[session.userId]) {
    localData.projects[session.userId] = localData.projects[session.userId].filter(p => p !== req.params.name);
  }
  res.redirect(`/app/settings?session=${session.id}`);
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
