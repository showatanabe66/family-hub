const date = new Date();
document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'}).format(date);
let currentView = 'schedules';
function showView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  document.getElementById('outingsPanel').classList.toggle('hidden', view !== 'outings');
  document.querySelectorAll('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== view);
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.addEventListener('family-panels-ready', () => showView(currentView));
// Associate existing labels with their controls, including dynamically created forms.
function labelControls() {
  document.querySelectorAll('label:not([for])').forEach(label => {
    const control = label.nextElementSibling;
    if (control?.matches('input[id], select[id], textarea[id]')) label.htmlFor = control.id;
  });
  document.querySelectorAll('.muted[id$="Message"], #aiStatus').forEach(el => el.setAttribute('role','status'));
}
labelControls();
document.addEventListener('family-panels-ready', labelControls);
// Keep account controls available from every section.
const tools = document.createElement('div');
tools.className = 'session-tools';
tools.append(document.getElementById('logoutBtn'));
document.getElementById('app').append(tools);
