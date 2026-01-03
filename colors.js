// Color palettes for different themes
const colorPalettes = {
  night: {
    bg: '#0a0a0a',
    textPrimary: '#e0e0e0',
    textSecondary: '#888888',
    border: '#222222',
    borderHover: '#444444',
    inputBg: '#1a1a1a',
    inputBorder: '#333333',
    cardBg: '#151515',
    btnBg: '#1a1a1a',
    btnText: '#e0e0e0',
    btnBgHover: '#2a2a2a',
    btnTextHover: '#ffffff',
    link: '#6b9dff',
    linkHover: '#8fb3ff',
    statusTodo: '#7a7a7a',
    statusInProgress: '#5b9dff',
    statusWaiting: '#ffb347',
    statusDone: '#6bcf7f',
    statusWontDo: '#4a4a4a',
    statusDeferred: '#9b7fdb',
    alert: '#ff6b6b',
    sub: '#2a2a2a'
  },
  basic: {
    bg: '#ffffff',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    border: '#d0d0d0',
    borderHover: '#999999',
    inputBg: '#ffffff',
    inputBorder: '#cccccc',
    cardBg: '#f9f9f9',
    btnBg: '#f0f0f0',
    btnText: '#1a1a1a',
    btnBgHover: '#e0e0e0',
    btnTextHover: '#000000',
    link: '#0066cc',
    linkHover: '#0052a3',
    statusTodo: '#8a8a8a',
    statusInProgress: '#4a8dff',
    statusWaiting: '#ff9f2e',
    statusDone: '#4caf50',
    statusWontDo: '#9e9e9e',
    statusDeferred: '#7c4dff',
    alert: '#e53935',
    sub: '#e0e0e0'
  }
};

// Generate CSS variables from a theme palette
function generateCSSVariables(theme = 'night') {
  const palette = colorPalettes[theme] || colorPalettes.night;

  return `
    --bg: ${palette.bg};
    --text-primary: ${palette.textPrimary};
    --text-secondary: ${palette.textSecondary};
    --border: ${palette.border};
    --border-hover: ${palette.borderHover};
    --input-bg: ${palette.inputBg};
    --input-border: ${palette.inputBorder};
    --card-bg: ${palette.cardBg};
    --btn-bg: ${palette.btnBg};
    --btn-text: ${palette.btnText};
    --btn-bg-hover: ${palette.btnBgHover};
    --btn-text-hover: ${palette.btnTextHover};
    --link: ${palette.link};
    --link-hover: ${palette.linkHover};
    --status-todo: ${palette.statusTodo};
    --status-in-progress: ${palette.statusInProgress};
    --status-waiting: ${palette.statusWaiting};
    --status-done: ${palette.statusDone};
    --status-wont-do: ${palette.statusWontDo};
    --status-deferred: ${palette.statusDeferred};
    --alert: ${palette.alert};
    --sub: ${palette.sub};
  `.trim();
}

// Get CSS class name for status
function getStatusClass(status) {
  const statusMap = {
    'todo': 'status-todo',
    'in_progress': 'status-in-progress',
    'waiting': 'status-waiting',
    'done': 'status-done',
    'wont_do': 'status-wont-do',
    'deferred': 'status-deferred'
  };

  return statusMap[status] || 'status-todo';
}

module.exports = {
  colorPalettes,
  generateCSSVariables,
  getStatusClass
};
