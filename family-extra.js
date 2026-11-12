import { createScheduleCalendar } from "./schedule-calendar.js";
import { initAppleSync, refreshImports, importedItems, clearImports } from "./apple-sync.js";

// Family Hub: 予定・買い物・タスク管理
export function initExtra(supabase) {
  if (document.getElementById("familyExtra")) return;

  const main = document.getElementById("app");
  if (!main) return;

  const wrap = document.createElement("div");
  wrap.id = "familyExtra";

  wrap.innerHTML = `
    <section class="card view-panel" data-panel="schedules" hidden>
      <h2>📅 家族の予定</h2>
      <div id="fxScheduleList" class="hub-list" aria-live="polite"></div>

    </section>

    <section class="card view-panel" data-panel="shopping" hidden>
      <h2>🛒 買い物リスト</h2>
      <div id="fxShopList" class="hub-list" aria-live="polite"></div>

    </section>

    <section class="card view-panel" data-panel="tasks" hidden>
      <h2>✅ 家族のタスク</h2>
      <div id="fxTaskList" class="hub-list" aria-live="polite"></div>

    </section>
  `;

  main.append(wrap);
  initAppleSync(supabase);

  const $ = id => document.getElementById(id);

  function makeText(tag, value) {
    const el = document.createElement(tag);
    el.textContent = value ?? "";
    return el;
  }

  function showError(id, error) {
    $(id).textContent = "エラー：" +
      (error.message || String(error));
  }

  function makeButton(label, action) {
    const btn = makeText("button", label);
    btn.type = "button";
    btn.className = "secondary";

    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await action();
      } catch (error) {
        alert(error.message || String(error));
      } finally {
        btn.disabled = false;
      }
    };
    return btn;
  }

  async function load(table, listId, msgId, render) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(table === "schedules" ? "date" : "created_at", { ascending: table === "schedules" });

    if (error) showError(msgId, error);
    const combined = [...(data || []), ...importedItems(table)];
    if (table === "schedules") combined.sort((a,b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));

    if (table === "schedules") { scheduleCalendar.update(combined); return; }
    const list = $(listId);
    list.replaceChildren();

    if (combined.length === 0) {
      const empty = makeText("p", "まだ登録がありません。「＋ 追加」タブから登録しましょう。");
      empty.className = "empty-state";
      list.append(empty);
      return;
    }

    combined.forEach(item => list.append(item.imported ? renderImported(item) : render(item)));
  }

  async function add(table, values, msgId, clearIds, reload) {
    const { error } = await supabase
      .from(table)
      .insert(values);

    if (error) {
      showError(msgId, error);
      return;
    }

    clearIds.forEach(id => $(id).value = "");
    $(msgId).textContent = "保存しました。";
    await reload();
  }

  async function remove(table, item, reload) {
    if (!confirm("この項目を削除しますか？")) return;

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", item.id);

    if (error) throw error;
    await reload();
  }

  async function toggle(table, item, reload) {
    const { error } = await supabase
      .from(table)
      .update({ done: !item.done })
      .eq("id", item.id);

    if (error) throw error;
    await reload();
  }

  function renderImported(item) {
    const el = document.createElement("div");
    el.className = "item imported-item";
    const title = makeText("strong", `${item.done ? "✓ " : ""}${item.name}`);
    if (item.done) title.style.textDecoration = "line-through";
    el.append(title);
    el.append(makeText("p", [item.date, item.time, item.source_name || "Appleから同期"].filter(Boolean).join(" ・ ")));
    if (item.memo) el.append(makeText("p", item.memo));
    el.append(makeText("small", "同期データ：変更・完了はカレンダー／リマインダーで操作してください。"));
    return el;
  }

  function renderSchedule(item) {
    const el = document.createElement("div");
    el.className = "item";

    el.append(makeText("strong", item.name));
    el.append(makeText(
      "p",
      `${item.date} ${item.time || ""} ・ ${item.person || "家族全員"}`
    ));

    el.append(makeButton("削除", () =>
      remove("schedules", item, refreshSchedules)
    ));

    return el;
  }

  const scheduleCalendar = createScheduleCalendar($("fxScheduleList"), item => item.imported ? renderImported(item) : renderSchedule(item));

  function renderCheckItem(table, item, reload, detail) {
    const el = document.createElement("div");
    el.className = "item";

    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "10px";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!item.done;
    check.style.width = "auto";

    check.onchange = async () => {
      check.disabled = true;
      try {
        await toggle(table, item, reload);
      } catch (error) {
        check.checked = !check.checked;
        alert(error.message);
      } finally { check.disabled = false; }
    };

    const name = makeText("span", item.name);
    if (item.done) name.style.textDecoration = "line-through";

    label.append(check, name);
    el.append(label);

    if (detail) el.append(makeText("p", detail));

    el.append(makeButton("削除", () =>
      remove(table, item, reload)
    ));

    return el;
  }

  const refreshSchedules = () =>
    load("schedules", "fxScheduleList", "fxScheduleMsg",
      renderSchedule);

  const refreshShopping = () =>
    load("shopping", "fxShopList", "fxShopMsg",
      item => renderCheckItem(
        "shopping", item, refreshShopping, item.memo
      ));

  const refreshTasks = () =>
    load("tasks", "fxTaskList", "fxTaskMsg",
      item => renderCheckItem(
        "tasks", item, refreshTasks,
        `${item.person || "家族全員"}${item.date ? " ・ 期限：" + item.date : ""}`
      ));

  async function refreshAll() {
    const { data: { session } } =
      await supabase.auth.getSession();

    if (!session) return;

    await refreshImports(supabase);
    await Promise.all([
      refreshSchedules(),
      refreshShopping(),
      refreshTasks()
    ]);
  }

  $("fxScheduleSave").onclick = async () => {
    const name = $("fxScheduleName").value.trim();
    const date = $("fxScheduleDate").value;

    if (!name || !date) {
      $("fxScheduleMsg").textContent =
        "予定名と日付を入力してください。";
      return;
    }

    await add("schedules", {
      name,
      date,
      time: $("fxScheduleTime").value,
      person: $("fxSchedulePerson").value.trim() || "家族全員"
    }, "fxScheduleMsg",
    ["fxScheduleName", "fxScheduleTime"],
    refreshSchedules);
  };

  $("fxShopSave").onclick = async () => {
    const name = $("fxShopName").value.trim();

    if (!name) {
      $("fxShopMsg").textContent =
        "買うものを入力してください。";
      return;
    }

    await add("shopping", {
      name,
      memo: $("fxShopMemo").value.trim()
    }, "fxShopMsg",
    ["fxShopName", "fxShopMemo"],
    refreshShopping);
  };

  $("fxTaskSave").onclick = async () => {
    const name = $("fxTaskName").value.trim();

    if (!name) {
      $("fxTaskMsg").textContent =
        "やることを入力してください。";
      return;
    }

    await add("tasks", {
      name,
      person: $("fxTaskPerson").value.trim() || "家族全員",
      date: $("fxTaskDate").value || null
    }, "fxTaskMsg",
    ["fxTaskName", "fxTaskDate"],
    refreshTasks);
  };

  supabase.auth.onAuthStateChange(event => {
    if (event === "SIGNED_IN" ||
        event === "INITIAL_SESSION") {
      setTimeout(() => {
        refreshAll().catch(console.error);
      }, 0);
    }

    if (event === "SIGNED_OUT") {
      clearImports();
      scheduleCalendar.reset();
      ["fxShopList", "fxTaskList"]
        .forEach(id => $(id).replaceChildren());
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshAll().catch(console.error);
    }
  });

  ["fxScheduleSave", "fxShopSave", "fxTaskSave"].forEach(id => {
    const button = $(id), action = button.onclick;
    button.onclick = async () => {
      button.disabled = true;
      try { await action(); }
      catch (error) { showError(id.replace("Save", "Msg"), error); }
      finally { button.disabled = false; }
    };
  });
  document.addEventListener("apple-sync-refresh", () => refreshAll().catch(console.error));
  let refreshing = false;
  setInterval(async () => {
    if (document.hidden || refreshing) return;
    refreshing = true;
    try { await refreshAll(); } catch(error) { console.error(error); }
    finally { refreshing = false; }
  }, 60000);
  document.dispatchEvent(new Event("family-panels-ready"));
  refreshAll().catch(console.error);
}
