(() => {
  // ----- DOM -----
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  const form = $("#todoForm");
  const taskInput = $("#taskInput");
  const dateInput = $("#dateInput");
  const prioInput = $("#priorityInput");
  const taskError = $("#taskError");
  const dateError = $("#dateError");

  const searchInput = $("#searchInput");
  const statusFilter = $("#statusFilter");
  const dateFilter = $("#dateFilter");
  const sortSelect = $("#sortSelect");

  const list = $("#taskList");
  const emptyState = $("#emptyState");

  const countTotal = $("#countTotal");
  const countActive = $("#countActive");
  const countDone = $("#countDone");
  const countOverdue = $("#countOverdue");

  const clearCompletedBtn = $("#clearCompletedBtn");
  const deleteAllBtn = $("#deleteAllBtn");
  const live = $("#live");

  // ----- State -----
  const STORAGE_KEY = "smart-todo::tasks";
  let tasks = load() || [];

  // ----- Utils -----
  const todayStr = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };
  const normalizeDate = (s) => {
    // "YYYY-MM-DD" -> Date at local midnight
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  };
  const isOverdue = (t) => !t.completed && normalizeDate(t.due) < normalizeDate(todayStr());

  const prioRank = (p) => ({ high: 3, medium: 2, low: 1 }[p] || 0);

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function announce(msg) { if (msg) { live.textContent = msg; } }

  // ----- Validation -----
  function validateInputs(text, date) {
    let ok = true;
    taskError.textContent = "";
    dateError.textContent = "";

    if (!text) {
      taskError.textContent = "Task is required.";
      ok = false;
    } else if (text.length > 120) {
      taskError.textContent = "Task is too long (max 120 chars).";
      ok = false;
    }

    if (!date) {
      dateError.textContent = "Due date is required.";
      ok = false;
    } else {
      const d = normalizeDate(date);
      const min = normalizeDate(todayStr());
      if (d < min) {
        dateError.textContent = "Due date cannot be in the past.";
        ok = false;
      }
    }
    return ok;
  }

  // ----- Rendering -----
  function render() {
    list.innerHTML = "";
    const query = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;   // all | active | done
    const dFilter = dateFilter.value;    // any | today | upcoming | overdue
    const sortBy = sortSelect.value;

    let filtered = tasks.filter((t) => {
      const matchesText = !query || t.title.toLowerCase().includes(query);
      const matchesStatus =
        status === "all" ||
        (status === "active" && !t.completed) ||
        (status === "done" && t.completed);

      let matchesDate = true;
      if (dFilter === "today") {
        matchesDate = t.due === todayStr();
      } else if (dFilter === "upcoming") {
        matchesDate = normalizeDate(t.due) > normalizeDate(todayStr());
      } else if (dFilter === "overdue") {
        matchesDate = isOverdue(t);
      }

      return matchesText && matchesStatus && matchesDate;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === "dueAsc") return normalizeDate(a.due) - normalizeDate(b.due);
      if (sortBy === "dueDesc") return normalizeDate(b.due) - normalizeDate(a.due);
      if (sortBy === "prioDesc") return prioRank(b.priority) - prioRank(a.priority);
      if (sortBy === "createdDesc") return b.createdAt - a.createdAt;
      return 0;
    });

    // Stats
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const active = total - done;
    const overdue = tasks.filter(isOverdue).length;

    countTotal.textContent = total;
    countActive.textContent = active;
    countDone.textContent = done;
    countOverdue.textContent = overdue;

    emptyState.style.display = filtered.length ? "none" : "block";

    // Render items
    for (const t of filtered) {
      list.appendChild(renderItem(t));
    }
  }

  function renderItem(t) {
    const li = document.createElement("li");
    li.className = "task";
    li.dataset.id = t.id;
    if (t.completed) li.classList.add("task--done");
    if (isOverdue(t)) li.classList.add("task--overdue");

    // Left: checkbox
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.ariaLabel = "Mark task completed";
    cb.checked = t.completed;
    cb.addEventListener("change", () => {
      t.completed = cb.checked;
      save(); render();
      announce(cb.checked ? "Task completed." : "Task marked active.");
    });

    // Middle: title + meta
    const middle = document.createElement("div");
    middle.className = "task__meta";

    const title = document.createElement("span");
    title.className = "task__title";
    title.textContent = t.title;

    const badges = document.createElement("div");
    badges.className = "task__badges";

    const dateBadge = document.createElement("span");
    dateBadge.className = "badge badge--date";
    dateBadge.textContent = t.due;

    const prBadge = document.createElement("span");
    prBadge.className = `badge badge--${t.priority}`;
    prBadge.textContent = t.priority[0].toUpperCase() + t.priority.slice(1);

    badges.append(dateBadge, prBadge);
    middle.append(title, badges);

    // Right: actions
    const actions = document.createElement("div");
    actions.className = "task__actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => enterEdit(li, t));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      tasks = tasks.filter(x => x.id !== t.id);
      save(); render();
      announce("Task deleted.");
    });

    actions.append(editBtn, delBtn);
    li.append(cb, middle, actions);
    return li;
  }

  // ----- Edit-in-place -----
  function enterEdit(li, t) {
    li.innerHTML = "";
    li.classList.remove("task--done", "task--overdue");

    const form = document.createElement("form");
    form.className = "task__edit";

    const title = document.createElement("input");
    title.type = "text";
    title.value = t.title;
    title.maxLength = 120;

    const due = document.createElement("input");
    due.type = "date";
    due.value = t.due;
    due.min = todayStr();

    const pr = document.createElement("select");
    ["low", "medium", "high"].forEach(p => {
      const o = document.createElement("option");
      o.value = p; o.textContent = p[0].toUpperCase() + p.slice(1);
      if (t.priority === p) o.selected = true;
      pr.appendChild(o);
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = "Save";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--danger";
    delBtn.textContent = "Delete";

    const err = document.createElement("small");
    err.className = "error";
    err.style.display = "block";

    form.append(title, due, pr, saveBtn, cancelBtn, delBtn, err);
    li.appendChild(form);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      err.textContent = "";

      const ok = validateInputs(title.value.trim(), due.value);
      if (!ok) { err.textContent = "Please fix the errors above."; return; }

      t.title = title.value.trim();
      t.due = due.value;
      t.priority = pr.value;

      save(); render();
      announce("Task updated.");
    });

    cancelBtn.addEventListener("click", () => render());
    delBtn.addEventListener("click", () => {
      tasks = tasks.filter(x => x.id !== t.id);
      save(); render();
      announce("Task deleted.");
    });
  }

  // ----- Event wiring -----
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = taskInput.value.trim();
    const due = dateInput.value;
    const prio = prioInput.value;

    if (!validateInputs(title, due)) return;

    const task = {
      id: crypto.randomUUID(),
      title,
      due,
      priority: prio,
      completed: false,
      createdAt: Date.now()
    };
    tasks.push(task);
    save();
    form.reset();
    // Keep min constraint after reset
    dateInput.min = todayStr();
    announce("Task added.");
    render();
  });

  [searchInput, statusFilter, dateFilter, sortSelect].forEach(el =>
    el.addEventListener("input", render)
  );

  clearCompletedBtn.addEventListener("click", () => {
    const before = tasks.length;
    tasks = tasks.filter(t => !t.completed);
    save(); render();
    announce(before === tasks.length ? "No completed tasks to clear." : "Cleared completed tasks.");
  });

  deleteAllBtn.addEventListener("click", () => {
    if (!tasks.length) { announce("No tasks to delete."); return; }
    if (confirm("Delete ALL tasks? This cannot be undone.")) {
      tasks = [];
      save(); render();
      announce("All tasks deleted.");
    }
  });

  // Keep date from going to past via UI
  function enforceMinDate() {
    dateInput.min = todayStr();
  }
  enforceMinDate();

  // ----- Initial render -----
  render();
})();