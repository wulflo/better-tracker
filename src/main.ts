import { invoke } from '@tauri-apps/api/core';

interface AppInfo { version: string; commit: string; build_date: string; vault_schema_version: number; }
interface Exercise { id: string; name: string; muscle: string; }
interface SetEntry { reps: number; weight: number; }
interface WorkoutEntry { exerciseId: string; sets: SetEntry[]; }
interface Workout { id: string; date: string; name: string; entries: WorkoutEntry[]; }

const LS_EX = 'bt_exercises';
const LS_WO = 'bt_workouts';

function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }
function uid(): string { return Math.random().toString(36).slice(2, 10); }

let exercises: Exercise[] = load<Exercise[]>(LS_EX, []);
let workouts: Workout[] = load<Workout[]>(LS_WO, []);
let currentEntries: WorkoutEntry[] = [];

function showView(name: string): void {
  document.querySelectorAll('section[id^="view-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`view-${name}`)?.classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.view === name));
  if (name === 'exercises') renderExercises();
  if (name === 'workout') renderWorkout();
  if (name === 'history') renderHistory();
  if (name === 'about') loadAbout();
}

function renderExercises(): void {
  const tbody = document.getElementById('ex-list')!;
  tbody.innerHTML = '';
  for (const ex of exercises) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${ex.name}</td><td>${ex.muscle}</td><td><button data-id="${ex.id}" class="del-ex">Eliminar</button></td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.del-ex').forEach(b => b.addEventListener('click', () => {
    const id = (b as HTMLElement).dataset.id!;
    exercises = exercises.filter(e => e.id !== id);
    save(LS_EX, exercises);
    renderExercises();
  }));
  const sel = document.getElementById('wo-ex-select') as HTMLSelectElement;
  sel.innerHTML = '';
  for (const ex of exercises) {
    const opt = document.createElement('option');
    opt.value = ex.id; opt.textContent = ex.name;
    sel.appendChild(opt);
  }
}

function renderWorkout(): void {
  const container = document.getElementById('wo-entries')!;
  container.innerHTML = '';
  for (const entry of currentEntries) {
    const ex = exercises.find(e => e.id === entry.exerciseId);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${ex?.name ?? entry.exerciseId}</h3><div class="sets"></div><button class="action add-set" data-id="${entry.exerciseId}">+ Serie</button>`;
    const setsDiv = card.querySelector('.sets')!;
    entry.sets.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>Serie ${i+1}</span><input type="number" value="${s.reps}" placeholder="reps" class="reps" data-i="${i}" /><input type="number" value="${s.weight}" placeholder="kg" class="weight" data-i="${i}" /><button class="del-set" data-i="${i}">x</button>`;
      setsDiv.appendChild(row);
    });
    setsDiv.querySelectorAll('.reps').forEach(inp => inp.addEventListener('input', (e) => {
      const i = Number((e.target as HTMLElement).dataset.i);
      entry.sets[i].reps = Number((e.target as HTMLInputElement).value);
    }));
    setsDiv.querySelectorAll('.weight').forEach(inp => inp.addEventListener('input', (e) => {
      const i = Number((e.target as HTMLElement).dataset.i);
      entry.sets[i].weight = Number((e.target as HTMLInputElement).value);
    }));
    setsDiv.querySelectorAll('.del-set').forEach(b => b.addEventListener('click', (e) => {
      const i = Number((e.target as HTMLElement).dataset.i);
      entry.sets.splice(i, 1);
      renderWorkout();
    }));
    card.querySelector('.add-set')!.addEventListener('click', () => {
      entry.sets.push({ reps: 0, weight: 0 });
      renderWorkout();
    });
    container.appendChild(card);
  }
}

function renderHistory(): void {
  const div = document.getElementById('history-list')!;
  div.innerHTML = '';
  if (workouts.length === 0) { div.innerHTML = '<p class="muted">Sin entrenamientos guardados.</p>'; return; }
  for (const w of [...workouts].reverse()) {
    const card = document.createElement('div');
    card.className = 'card';
    let html = `<h3>${w.name} <span class="muted">(${w.date})</span></h3><ul>`;
    for (const e of w.entries) {
      const ex = exercises.find(x => x.id === e.exerciseId);
      html += `<li>${ex?.name ?? e.exerciseId}: ${e.sets.map(s => `${s.reps}x${s.weight}kg`).join(', ')}</li>`;
    }
    html += '</ul>';
    card.innerHTML = html;
    div.appendChild(card);
  }
}

async function loadAbout(): Promise<void> {
  try {
    const info = await invoke<AppInfo>('get_app_info');
    (document.getElementById('version')!).textContent = info.version;
    (document.getElementById('commit')!).textContent = info.commit;
    (document.getElementById('build-date')!).textContent = info.build_date;
    (document.getElementById('vault')!).textContent = String(info.vault_schema_version);
  } catch (e) { console.error(e); }
}

document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showView((b as HTMLElement).dataset.view!)));

document.getElementById('ex-add')!.addEventListener('click', () => {
  const name = (document.getElementById('ex-name') as HTMLInputElement).value.trim();
  const muscle = (document.getElementById('ex-muscle') as HTMLInputElement).value.trim();
  if (!name) return;
  exercises.push({ id: uid(), name, muscle });
  save(LS_EX, exercises);
  (document.getElementById('ex-name') as HTMLInputElement).value = '';
  (document.getElementById('ex-muscle') as HTMLInputElement).value = '';
  renderExercises();
});

document.getElementById('wo-add-ex')!.addEventListener('click', () => {
  const sel = document.getElementById('wo-ex-select') as HTMLSelectElement;
  const id = sel.value;
  if (!id) return;
  currentEntries.push({ exerciseId: id, sets: [] });
  renderWorkout();
});

document.getElementById('wo-save')!.addEventListener('click', () => {
  const name = (document.getElementById('wo-name') as HTMLInputElement).value.trim() || 'Entrenamiento';
  const date = (document.getElementById('wo-date') as HTMLInputElement).value || new Date().toISOString().slice(0, 10);
  if (currentEntries.length === 0) { (document.getElementById('wo-status')!).textContent = 'Añade al menos un ejercicio.'; return; }
  workouts.push({ id: uid(), date, name, entries: currentEntries });
  save(LS_WO, workouts);
  currentEntries = [];
  (document.getElementById('wo-name') as HTMLInputElement).value = '';
  renderWorkout();
  (document.getElementById('wo-status')!).textContent = 'Guardado.';
});

const dateInput = document.getElementById('wo-date') as HTMLInputElement;
dateInput.value = new Date().toISOString().slice(0, 10);

showView('exercises');
renderExercises();