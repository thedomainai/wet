const fs = require('fs');
const path = require('path');

/**
 * Markdown Sync Utility
 * 
 * Supabaseのデータを元にMarkdownファイルを生成/更新する
 * Cursorや他のエディタでの編集を可能にする
 */

const TASKS_DIR = process.env.TASKS_DIR || './tasks';

// Ensure tasks directory exists
function ensureTasksDir() {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
}

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };
  
  const frontmatterStr = match[1];
  const body = content.slice(match[0].length).trim();
  
  const frontmatter = {};
  frontmatterStr.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const value = valueParts.join(':').trim();
      frontmatter[key.trim()] = value === 'null' ? null : value;
    }
  });
  
  return { frontmatter, body };
}

// Generate frontmatter string
function generateFrontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => {
    return `${key}: ${value === null ? 'null' : value}`;
  });
  return `---\n${lines.join('\n')}\n---`;
}

// Generate INBOX.md from tasks without due date
function generateInboxMd(tasks) {
  const inboxTasks = tasks.filter(t => !t.due && t.status !== 'done' && t.status !== 'wont_do');
  
  let content = '# Inbox\n\n';
  content += '<!-- 期日未設定のタスク -->\n\n';
  
  inboxTasks.forEach(task => {
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    const project = task.project ? ` @${task.project}` : '';
    const estimate = task.estimate ? ` est:${task.estimate}h` : '';
    content += `- ${checkbox} ${task.name}${project}${estimate}\n`;
  });
  
  return content;
}

// Generate NOW.md from today's tasks
function generateNowMd(tasks) {
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.due === today && t.status !== 'done' && t.status !== 'wont_do');
  const overdueTasks = tasks.filter(t => t.due && t.due < today && t.status !== 'done' && t.status !== 'wont_do');
  const doneTodayTasks = tasks.filter(t => t.completedAt && t.completedAt.startsWith(today));
  
  let content = `# Now\n\n`;
  content += `<!-- 今日やること: ${today} -->\n\n`;
  
  if (overdueTasks.length > 0) {
    content += '## Overdue\n\n';
    overdueTasks.forEach(task => {
      const project = task.project ? ` @${task.project}` : '';
      content += `- [ ] ${task.name}${project} (due: ${task.due})\n`;
    });
    content += '\n';
  }
  
  content += '## Focus\n\n';
  todayTasks.forEach(task => {
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    const project = task.project ? ` @${task.project}` : '';
    const estimate = task.estimate ? ` est:${task.estimate}h` : '';
    content += `- ${checkbox} ${task.name}${project}${estimate}\n`;
  });
  
  if (doneTodayTasks.length > 0) {
    content += '\n## Done Today\n\n';
    doneTodayTasks.forEach(task => {
      const project = task.project ? ` @${task.project}` : '';
      content += `- [x] ${task.name}${project}\n`;
    });
  }
  
  return content;
}

// Generate UPCOMING.md from future tasks
function generateUpcomingMd(tasks) {
  const today = new Date().toISOString().split('T')[0];
  const upcomingTasks = tasks
    .filter(t => t.due && t.due > today && t.status !== 'done' && t.status !== 'wont_do')
    .sort((a, b) => a.due.localeCompare(b.due));
  
  let content = '# Upcoming\n\n';
  content += '<!-- 明日以降のタスク -->\n\n';
  
  // Group by date
  const grouped = {};
  upcomingTasks.forEach(task => {
    if (!grouped[task.due]) grouped[task.due] = [];
    grouped[task.due].push(task);
  });
  
  Object.entries(grouped).forEach(([date, dateTasks]) => {
    content += `## ${date}\n\n`;
    dateTasks.forEach(task => {
      const checkbox = task.status === 'done' ? '[x]' : '[ ]';
      const project = task.project ? ` @${task.project}` : '';
      const estimate = task.estimate ? ` est:${task.estimate}h` : '';
      content += `- ${checkbox} ${task.name}${project}${estimate}\n`;
    });
    content += '\n';
  });
  
  return content;
}

// Generate individual task file
function generateTaskMd(task) {
  const frontmatter = generateFrontmatter({
    id: task.id,
    name: task.name,
    status: task.status,
    due: task.due,
    project: task.project,
    estimate: task.estimate,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  });
  
  let content = `${frontmatter}\n\n`;
  content += `# ${task.name}\n\n`;
  content += `## Notes\n\n${task.notes || ''}\n\n`;
  content += `## History\n\n`;
  
  if (task.history && task.history.length > 0) {
    task.history.forEach(h => {
      const date = h.timestamp ? h.timestamp.split('T')[0] : 'unknown';
      let entry = `- ${date}: ${h.action}`;
      if (h.type) entry += ` (${h.type})`;
      if (h.from || h.to) entry += `: ${h.from || 'null'} → ${h.to || 'null'}`;
      content += entry + '\n';
    });
  }
  
  return content;
}

// Sync all markdown files from database
async function syncToMarkdown(tasks) {
  ensureTasksDir();
  
  // Generate view files
  fs.writeFileSync(path.join(TASKS_DIR, 'INBOX.md'), generateInboxMd(tasks));
  fs.writeFileSync(path.join(TASKS_DIR, 'NOW.md'), generateNowMd(tasks));
  fs.writeFileSync(path.join(TASKS_DIR, 'UPCOMING.md'), generateUpcomingMd(tasks));
  
  // Generate individual task files (optional, in tasks/items/)
  const itemsDir = path.join(TASKS_DIR, 'items');
  if (!fs.existsSync(itemsDir)) fs.mkdirSync(itemsDir, { recursive: true });
  
  tasks.forEach(task => {
    const filename = `${task.id}.md`;
    fs.writeFileSync(path.join(itemsDir, filename), generateTaskMd(task));
  });
  
  return { success: true };
}

// Parse markdown file back to task data (for future use with file watching)
function parseTaskMd(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  
  // Extract notes section
  const notesMatch = body.match(/## Notes\n\n([\s\S]*?)(?=\n## |$)/);
  const notes = notesMatch ? notesMatch[1].trim() : '';
  
  return {
    ...frontmatter,
    notes,
  };
}

module.exports = {
  ensureTasksDir,
  parseFrontmatter,
  generateFrontmatter,
  generateInboxMd,
  generateNowMd,
  generateUpcomingMd,
  generateTaskMd,
  syncToMarkdown,
  parseTaskMd,
};
