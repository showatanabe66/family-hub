const sources = new Set(['schedules', 'shopping', 'tasks']);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function text(value, max = 2000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text');
  return value;
}
export function validateSnapshot(body, now = Date.now()) {
  if (!body || body.version !== 1 || !body.sources || Array.isArray(body.sources) || typeof body.sources !== 'object') throw new Error('Expected version: 1 and sources object');
  if (typeof body.captured_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(body.captured_at)) throw new Error('captured_at requires ISO 8601 with timezone');
  const timestamp = Date.parse(body.captured_at);
  if (!Number.isFinite(timestamp) || timestamp > now + 300000 || timestamp < now - 86400000) throw new Error('Invalid captured_at');
  const entries = Object.entries(body.sources);
  if (!entries.length) throw new Error('At least one source is required');
  const normalized = {};
  for (const [source, items] of entries) {
    if (!sources.has(source) || !Array.isArray(items) || items.length > 2000) throw new Error('Invalid source or too many items');
    normalized[source] = items.map(item => {
      if (!item || typeof item !== 'object') throw new Error('Invalid item');
      const name = text(item.name, 500).trim();
      if (!name) throw new Error('Item name required');
      const date = text(item.date, 10);
      if ((source === 'schedules' && !date) || (date && !validDate(date))) throw new Error('Invalid date');
      const time = text(item.time, 5);
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid time');
      if (item.done != null && typeof item.done !== 'boolean') throw new Error('done must be boolean');
      return {name, date, time, memo:text(item.memo), source_name:text(item.source_name, 200), done:item.done ?? false};
    });
  }
  return {captured_at:new Date(timestamp).toISOString(), sources:normalized};
}
