const date = new Date();
document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'}).format(date);
const requestedView = new URLSearchParams(globalThis.location?.search || '').get('view');
let currentView = ['outings','schedules','shopping','tasks','add'].includes(requestedView) ? requestedView : 'outings';
function showView(view) {
  currentView = view;
  const welcome = document.getElementById("familyWelcome");
  if (welcome) welcome.hidden = view === "outings";
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  document.getElementById('outingsPanel').classList.toggle('hidden', view !== 'outings');
  document.querySelectorAll('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== view);
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.addEventListener('family-panels-ready', () => {
  showView(currentView);
  if (currentView === 'add' && globalThis.location?.hash === '#widgetSettings') {
    const section = document.getElementById('widgetSettings');
    section?.querySelector('details')?.setAttribute('open','');
    section?.scrollIntoView({block:'start'});
  }
});
showView(currentView);
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
