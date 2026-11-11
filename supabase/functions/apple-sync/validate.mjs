const sources = new Set(['schedules', 'shopping', 'tasks']);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export class SnapshotValidationError extends Error {
  constructor(field, hint, actual) {
    super(hint);
    this.field = field;
    this.actual_type = actual === null ? 'null' : Array.isArray(actual) ? 'list' : typeof actual;
  }
}
function invalid(field, hint, actual) { throw new SnapshotValidationError(field, hint, actual); }
function text(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) invalid(field, 'テキストの変数を指定してください。文字数上限も確認してください。', value);
  return value;
}
export function validateSnapshot(body, now = Date.now()) {
  if (!body || Array.isArray(body) || typeof body !== 'object') invalid('body', '本文をJSONの辞書にしてください。', body);
  if (body.version !== 1) invalid('version', 'versionの種類を「数字」、値を1にしてください。', body.version);
  if (!body.sources || Array.isArray(body.sources) || typeof body.sources !== 'object') invalid('sources', 'sourcesを辞書にしてください。', body.sources);
  if (typeof body.captured_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(body.captured_at)) invalid('captured_at', 'captured_atには「日付を書式設定」の出力を選び、ISO 8601・時刻を含めるを指定してください。', body.captured_at);
  const timestamp = Date.parse(body.captured_at);
  if (!Number.isFinite(timestamp) || timestamp > now + 300000 || timestamp < now - 86400000) invalid('captured_at', '有効な現在日時が必要です。iPhoneの日時設定と、書式設定後の日付変数を確認してください。', body.captured_at);
  const entries = Object.entries(body.sources);
  if (!entries.length) invalid('sources', 'sourcesの辞書にshopping・tasks・schedulesのいずれかを追加してください。', body.sources);
  const normalized = {};
  for (const [source, items] of entries) {
    if (!sources.has(source)) invalid('sources', 'キーはshopping・tasks・schedulesのいずれかにしてください。', items);
    const path = `sources.${source}`;
    if (!Array.isArray(items)) invalid(path, 'この値はリストが必要です。「繰り返しの結果」をリスト全体の変数として指定してください。', items);
    if (items.length > 2000) invalid(path, '1種類の同期は2000件までです。', items);
    normalized[source] = items.map((item, index) => {
      const row = `${path}[${index}]`;
      if (!item || Array.isArray(item) || typeof item !== 'object') invalid(row, '繰り返しの結果の各項目は、nameとsource_nameを持つ辞書にしてください。', item);
      const name = text(item.name, 500, `${row}.name`).trim();
      if (!name) invalid(`${row}.name`, 'nameに「繰り返し項目」の「タイトル」を指定してください。', item.name);
      const date = text(item.date, 10, `${row}.date`);
      if ((source === 'schedules' && !date) || (date && !validDate(date))) invalid(`${row}.date`, '日付はyyyy-MM-dd形式にしてください。予定には日付が必須です。', item.date);
      const time = text(item.time, 5, `${row}.time`);
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) invalid(`${row}.time`, '時刻はHH:mm形式にしてください。終日予定は空文字にしてください。', item.time);
      if (item.done != null && typeof item.done !== 'boolean') invalid(`${row}.done`, 'doneはブール値にするか、省略してください。', item.done);
      return {name, date, time, memo:text(item.memo, 2000, `${row}.memo`), source_name:text(item.source_name, 200, `${row}.source_name`), done:item.done ?? false};
    });
  }
  return {captured_at:new Date(timestamp).toISOString(), sources:normalized};
}
