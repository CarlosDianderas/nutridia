import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Settings2, Plus, X, Star, Trash2, Check, Calendar, Pencil, LogOut, Mail, Lock } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const CORE_MEALS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' },
];
const MACRO_LABELS = { carbs: 'Carbohidratos', protein: 'Proteínas', fat: 'Grasas' };
const MACRO_COLORS = { carbs: '#E8A33D', protein: '#C1583F', fat: '#7B5EA7' };
const MACRO_UNIT = 'g';

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateEs(iso) {
  const d = new Date(iso + 'T00:00:00');
  const s = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isToday(iso) {
  return iso === toISO(new Date());
}

const DEFAULT_FAVORITES = [
  { name: 'Aceite de oliva', quantity: 14, unit: 'g', calories: 90, carbs: 0, protein: 0, fat: 10 },
  { name: 'Plátano de seda', quantity: 150, unit: 'g', calories: 125, carbs: 32, protein: 2, fat: 0 },
  { name: 'Huevo', quantity: 4, unit: 'unidad', calories: 312, carbs: 2, protein: 25, fat: 21 },
  { name: 'Tostadas', quantity: 2, unit: 'unidad', calories: 127, carbs: 25, protein: 3, fat: 1 },
  { name: 'Arroz crudo', quantity: 100, unit: 'g', calories: 333, carbs: 74, protein: 8, fat: 1 },
  { name: 'Pollo', quantity: 200, unit: 'g', calories: 220, carbs: 0, protein: 46, fat: 2 },
  { name: 'Papa hervida', quantity: 250, unit: 'g', calories: 220, carbs: 43, protein: 5, fat: 0 },
];

function emptyDay() {
  return { sections: CORE_MEALS.map((m) => ({ id: m.id, label: m.label, removable: false, entries: [] })) };
}

function nextSnackId(sections) {
  return `snack-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

function nextSnackLabel(sections) {
  const count = sections.filter((s) => s.removable).length;
  return `Snack ${count + 1}`;
}

function normalizeDay(raw) {
  if (!raw) return emptyDay();
  if (Array.isArray(raw.sections)) return raw;
  if (raw.meals) {
    const sections = CORE_MEALS.map((m) => ({ id: m.id, label: m.label, removable: false, entries: raw.meals[m.id] || [] }));
    if (raw.meals.snack && raw.meals.snack.length > 0) {
      sections.push({ id: 'snack-legacy', label: 'Snack 1', removable: true, entries: raw.meals.snack });
    }
    return { sections };
  }
  return emptyDay();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round(v) {
  return Math.round(v * 10) / 10;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dateISO, setDateISO] = useState(toISO(new Date()));
  const [dayData, setDayData] = useState(emptyDay());
  const [goals, setGoals] = useState({ calories: 2000, carbs: 250, protein: 120, fat: 65 });
  const [favorites, setFavorites] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [dayLoading, setDayLoading] = useState(true);
  const [openMeal, setOpenMeal] = useState(null);
  const [showGoals, setShowGoals] = useState(false);
  const [goalsDraft, setGoalsDraft] = useState(goals);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setInitialized(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profile_data')
        .select('goals, favorites')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (data.goals) {
          setGoals(data.goals);
          setGoalsDraft(data.goals);
        }
        if (data.favorites) {
          setFavorites(data.favorites);
        } else {
          setFavorites(DEFAULT_FAVORITES);
          await supabase.from('profile_data').upsert({ user_id: session.user.id, favorites: DEFAULT_FAVORITES });
        }
      } else {
        setFavorites(DEFAULT_FAVORITES);
        await supabase.from('profile_data').upsert({ user_id: session.user.id, favorites: DEFAULT_FAVORITES });
      }
      if (!cancelled) setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setDayLoading(true);
    (async () => {
      const { data } = await supabase
        .from('days')
        .select('data')
        .eq('user_id', session.user.id)
        .eq('date', dateISO)
        .maybeSingle();
      if (!cancelled) setDayData(data && data.data ? normalizeDay(data.data) : emptyDay());
      if (!cancelled) setDayLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dateISO, session]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  const persistDay = useCallback(async (newData, iso) => {
    setDayData(newData);
    if (!session) return;
    const { error } = await supabase.from('days').upsert({
      user_id: session.user.id,
      date: iso,
      data: newData,
      updated_at: new Date().toISOString(),
    });
    if (error) showToast('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
  }, [session]);

  async function persistGoals(newGoals) {
    setGoals(newGoals);
    if (!session) return;
    const { error } = await supabase.from('profile_data').upsert({ user_id: session.user.id, goals: newGoals });
    if (error) showToast('No se pudieron guardar tus metas.');
  }

  async function persistFavorites(newFavs) {
    setFavorites(newFavs);
    if (!session) return;
    await supabase.from('profile_data').upsert({ user_id: session.user.id, favorites: newFavs });
  }

  function addFood(sectionId, food, saveAsFavorite) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: food.name.trim(),
      quantity: n(food.quantity) || null,
      unit: food.unit || 'g',
      calories: n(food.calories),
      carbs: n(food.carbs),
      protein: n(food.protein),
      fat: n(food.fat),
    };
    const newSections = dayData.sections.map((s) => (s.id === sectionId ? { ...s, entries: [...s.entries, entry] } : s));
    persistDay({ ...dayData, sections: newSections }, dateISO);
    if (saveAsFavorite) {
      const exists = favorites.some((f) => f.name.toLowerCase() === entry.name.toLowerCase());
      if (!exists) {
        persistFavorites([...favorites, { name: entry.name, quantity: entry.quantity, unit: entry.unit, calories: entry.calories, carbs: entry.carbs, protein: entry.protein, fat: entry.fat }]);
      }
    }
    setOpenMeal(null);
    const label = dayData.sections.find((s) => s.id === sectionId)?.label || '';
    showToast(`${entry.name} añadido a ${label}`);
  }

  function editFood(sourceSectionId, id, food, targetSectionId) {
    const updated = {
      id,
      name: food.name.trim(),
      quantity: n(food.quantity) || null,
      unit: food.unit || 'g',
      calories: n(food.calories),
      carbs: n(food.carbs),
      protein: n(food.protein),
      fat: n(food.fat),
    };
    const dest = targetSectionId && targetSectionId !== sourceSectionId ? targetSectionId : sourceSectionId;
    let newSections;
    if (dest !== sourceSectionId) {
      newSections = dayData.sections.map((s) => {
        if (s.id === sourceSectionId) return { ...s, entries: s.entries.filter((f) => f.id !== id) };
        if (s.id === dest) return { ...s, entries: [...s.entries, updated] };
        return s;
      });
    } else {
      newSections = dayData.sections.map((s) =>
        s.id === sourceSectionId ? { ...s, entries: s.entries.map((f) => (f.id === id ? updated : f)) } : s
      );
    }
    persistDay({ ...dayData, sections: newSections }, dateISO);
    const destLabel = dayData.sections.find((s) => s.id === dest)?.label || '';
    showToast(dest !== sourceSectionId ? `${updated.name} movido a ${destLabel}` : `${updated.name} actualizado`);
  }

  function removeFood(sectionId, id) {
    const newSections = dayData.sections.map((s) => (s.id === sectionId ? { ...s, entries: s.entries.filter((f) => f.id !== id) } : s));
    persistDay({ ...dayData, sections: newSections }, dateISO);
  }

  function quickAdd(sectionId, fav) {
    addFood(sectionId, fav, false);
  }

  function moveSection(sectionId, direction) {
    const idx = dayData.sections.findIndex((s) => s.id === sectionId);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= dayData.sections.length) return;
    const newSections = [...dayData.sections];
    const [moved] = newSections.splice(idx, 1);
    newSections.splice(newIdx, 0, moved);
    persistDay({ ...dayData, sections: newSections }, dateISO);
  }

  function addSnackSection() {
    const newSection = { id: nextSnackId(dayData.sections), label: nextSnackLabel(dayData.sections), removable: true, entries: [] };
    persistDay({ ...dayData, sections: [...dayData.sections, newSection] }, dateISO);
    showToast(`${newSection.label} agregado`);
  }

  function removeSection(sectionId) {
    const section = dayData.sections.find((s) => s.id === sectionId);
    const newSections = dayData.sections.filter((s) => s.id !== sectionId);
    persistDay({ ...dayData, sections: newSections }, dateISO);
    if (section) showToast(`${section.label} eliminado`);
  }

  function removeFavorite(name) {
    persistFavorites(favorites.filter((f) => f.name !== name));
  }

  function changeDay(delta) {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setDateISO(toISO(d));
    setOpenMeal(null);
  }

  function saveGoals() {
    const clean = {
      calories: Math.max(0, n(goalsDraft.calories)) || 2000,
      carbs: Math.max(0, n(goalsDraft.carbs)),
      protein: Math.max(0, n(goalsDraft.protein)),
      fat: Math.max(0, n(goalsDraft.fat)),
    };
    persistGoals(clean);
    setShowGoals(false);
    showToast('Metas actualizadas');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const allEntries = dayData.sections.flatMap((s) => s.entries || []);
  const totals = allEntries.reduce(
    (acc, f) => ({
      calories: acc.calories + n(f.calories),
      carbs: acc.carbs + n(f.carbs),
      protein: acc.protein + n(f.protein),
      fat: acc.fat + n(f.fat),
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  );

  const remaining = Math.round(goals.calories - totals.calories);
  const progressPct = goals.calories > 0 ? Math.min(totals.calories / goals.calories, 1) : 0;

  const macroKcal = {
    carbs: totals.carbs * 4,
    protein: totals.protein * 4,
    fat: totals.fat * 9,
  };
  const macroKcalTotal = macroKcal.carbs + macroKcal.protein + macroKcal.fat;

  const R = 84;
  const STROKE = 15;
  const C = 2 * Math.PI * R;
  const cx = 110, cy = 110;

  let cumulative = 0;
  const ringSegments = ['carbs', 'protein', 'fat'].map((key) => {
    const share = macroKcalTotal > 0 ? macroKcal[key] / macroKcalTotal : 0;
    const arcLen = C * progressPct * share;
    const seg = { key, arcLen, offset: cumulative };
    cumulative += arcLen;
    return seg;
  });

  if (authLoading) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <style>{FONT_IMPORT}</style>
        <p style={{ fontFamily: 'Inter, sans-serif', color: '#5B6B62', fontSize: 14 }}>Cargando…</p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!initialized) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <style>{FONT_IMPORT}</style>
        <p style={{ fontFamily: 'Inter, sans-serif', color: '#5B6B62', fontSize: 14 }}>Cargando tu registro…</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{FONT_IMPORT + EXTRA_CSS}</style>

      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.wordmark}>NutriDía</p>
            <p style={styles.tagline}>Tu registro de comidas, simple.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              aria-label="Ajustar metas"
              onClick={() => { setGoalsDraft(goals); setShowGoals((s) => !s); }}
              style={styles.iconBtn}
            >
              <Settings2 size={18} color={showGoals ? '#FBFAF6' : '#2F6F5E'} />
            </button>
            <button aria-label="Cerrar sesión" onClick={handleLogout} style={styles.iconBtn}>
              <LogOut size={18} color="#2F6F5E" />
            </button>
          </div>
        </header>

        {showGoals && (
          <div style={styles.goalsPanel}>
            <p style={styles.panelTitle}>Tus metas diarias</p>
            <div style={styles.goalsGrid}>
              <GoalField label="Calorías (kcal)" value={goalsDraft.calories} onChange={(v) => setGoalsDraft({ ...goalsDraft, calories: v })} />
              <GoalField label="Carbohidratos (g)" value={goalsDraft.carbs} onChange={(v) => setGoalsDraft({ ...goalsDraft, carbs: v })} color={MACRO_COLORS.carbs} />
              <GoalField label="Proteínas (g)" value={goalsDraft.protein} onChange={(v) => setGoalsDraft({ ...goalsDraft, protein: v })} color={MACRO_COLORS.protein} />
              <GoalField label="Grasas (g)" value={goalsDraft.fat} onChange={(v) => setGoalsDraft({ ...goalsDraft, fat: v })} color={MACRO_COLORS.fat} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={saveGoals} style={styles.primaryBtn}>Guardar metas</button>
              <button onClick={() => setShowGoals(false)} style={styles.ghostBtn}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={styles.dateNav}>
          <button aria-label="Día anterior" onClick={() => changeDay(-1)} style={styles.navBtn}>
            <ChevronLeft size={18} color="#2F6F5E" />
          </button>
          <div style={styles.datePill}>
            <Calendar size={14} color="#2F6F5E" style={{ marginRight: 6 }} />
            <span>{formatDateEs(dateISO)}</span>
            {isToday(dateISO) && <span style={styles.todayBadge}>Hoy</span>}
          </div>
          <button aria-label="Día siguiente" onClick={() => changeDay(1)} style={styles.navBtn}>
            <ChevronRight size={18} color="#2F6F5E" />
          </button>
        </div>

        <section style={styles.heroCard}>
          {dayLoading ? (
            <p style={{ fontFamily: 'Inter, sans-serif', color: '#9BA69C', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Cargando…</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <svg width="220" height="220" viewBox="0 0 220 220">
                  <circle cx={cx} cy={cy} r={R} fill="none" stroke="#E4E8DE" strokeWidth={STROKE} />
                  {ringSegments.map((seg) =>
                    seg.arcLen > 0.3 ? (
                      <circle
                        key={seg.key}
                        cx={cx}
                        cy={cy}
                        r={R}
                        fill="none"
                        stroke={MACRO_COLORS[seg.key]}
                        strokeWidth={STROKE}
                        strokeDasharray={`${seg.arcLen} ${C - seg.arcLen}`}
                        strokeDashoffset={-seg.offset}
                        strokeLinecap="butt"
                        transform={`rotate(-90 ${cx} ${cy})`}
                      />
                    ) : null
                  )}
                  <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 30, fontWeight: 600, fill: '#1F2A24' }}>
                    {Math.round(totals.calories)}
                  </text>
                  <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fill: '#5B6B62' }}>
                    de {Math.round(goals.calories)} kcal
                  </text>
                  <text x={cx} y={cy + 36} textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, fill: remaining >= 0 ? '#2F6F5E' : '#C1583F' }}>
                    {remaining >= 0 ? `${remaining} kcal restantes` : `${Math.abs(remaining)} kcal sobre tu meta`}
                  </text>
                </svg>
              </div>

              <div style={styles.macroLegend}>
                {['carbs', 'protein', 'fat'].map((key) => (
                  <div key={key} style={styles.macroLegendItem}>
                    <span style={{ ...styles.macroDot, background: MACRO_COLORS[key] }} />
                    <div style={{ flex: 1 }}>
                      <p style={styles.macroLegendLabel}>{MACRO_LABELS[key]}</p>
                      <p style={styles.macroLegendValue}>
                        {round(totals[key])} / {round(goals[key])} {MACRO_UNIT}
                      </p>
                    </div>
                    <div style={styles.macroBarTrack}>
                      <div
                        style={{
                          ...styles.macroBarFill,
                          background: MACRO_COLORS[key],
                          width: `${goals[key] > 0 ? Math.min((totals[key] / goals[key]) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {!dayLoading && dayData.sections.map((section, idx) => (
          <MealCard
            key={section.id}
            section={section}
            allSections={dayData.sections}
            open={openMeal === section.id}
            onToggleOpen={() => setOpenMeal(openMeal === section.id ? null : section.id)}
            onRemove={(id) => removeFood(section.id, id)}
            onEdit={(id, food, targetSectionId) => editFood(section.id, id, food, targetSectionId)}
            onAdd={(food, saveAsFavorite) => addFood(section.id, food, saveAsFavorite)}
            onRemoveSection={section.removable ? () => removeSection(section.id) : null}
            onMoveUp={section.removable && idx > 0 ? () => moveSection(section.id, -1) : null}
            onMoveDown={section.removable && idx < dayData.sections.length - 1 ? () => moveSection(section.id, 1) : null}
            favorites={favorites}
            onQuickAdd={(fav) => quickAdd(section.id, fav)}
            onRemoveFavorite={removeFavorite}
          />
        ))}

        {!dayLoading && (
          <button onClick={addSnackSection} style={styles.addSnackBtn}>
            <Plus size={15} style={{ marginRight: 5, verticalAlign: -3 }} />
            Agregar snack
          </button>
        )}

        <p style={styles.footerNote}>Tus datos se guardan solo en tu cuenta y persisten entre visitas.</p>
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!email.trim() || !password) {
      setError('Completa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setNotice('Cuenta creada. Revisa tu correo para confirmar tu cuenta antes de entrar.');
      }
    }
    setLoading(false);
  }

  return (
    <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ ...styles.heroCard, width: '100%', maxWidth: 360 }}>
        <p style={{ ...styles.wordmark, textAlign: 'center', marginBottom: 4 }}>NutriDía</p>
        <p style={{ ...styles.tagline, textAlign: 'center', marginBottom: 22 }}>
          {mode === 'signin' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ ...styles.miniField, marginBottom: 12 }}>
            <span style={styles.miniLabel}><Mail size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.textInput}
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </label>
          <label style={styles.miniField}>
            <span style={styles.miniLabel}><Lock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.textInput}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p style={styles.errorText}>{error}</p>}
          {notice && <p style={{ ...styles.searchNote, marginTop: 8 }}>{notice}</p>}

          <button type="submit" disabled={loading} style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 14 }}>
            {loading ? 'Un momento…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
          style={{ ...styles.addLink, width: '100%', justifyContent: 'center', marginTop: 14 }}
        >
          {mode === 'signin' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </button>
      </div>
    </div>
  );
}

function GoalField({ label, value, onChange, color }) {
  return (
    <label style={styles.goalField}>
      <span style={{ ...styles.goalFieldLabel, color: color || '#5B6B62' }}>{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.numInput}
      />
    </label>
  );
}

function baseFromEntry(f) {
  const unit = f.unit || 'g';
  const qty = f.quantity || (unit === 'unidad' ? 1 : 100);
  const factor = unit === 'unidad' ? qty : qty / 100;
  const safeFactor = factor || 1;
  return {
    name: f.name,
    quantity: qty,
    unit,
    baseCalories: round(n(f.calories) / safeFactor),
    baseCarbs: round(n(f.carbs) / safeFactor),
    baseProtein: round(n(f.protein) / safeFactor),
    baseFat: round(n(f.fat) / safeFactor),
  };
}

function MealCard({ section, allSections, open, onToggleOpen, onRemove, onEdit, onAdd, onRemoveSection, onMoveUp, onMoveDown, favorites, onQuickAdd, onRemoveFavorite }) {
  const entries = section.entries || [];
  const mealTotal = entries.reduce((s, f) => s + n(f.calories), 0);
  const [editingId, setEditingId] = useState(null);

  return (
    <section style={styles.mealCard}>
      <div style={styles.mealHeaderRow}>
        <h2 style={styles.mealTitle}>{section.label}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...styles.mealTotalKcal, marginRight: 4 }}>{Math.round(mealTotal)} kcal</span>
          {(onMoveUp || onMoveDown) && (
            <div style={styles.moveBtnGroup}>
              <button
                aria-label={`Subir ${section.label}`}
                onClick={onMoveUp || undefined}
                disabled={!onMoveUp}
                style={{ ...styles.moveBtn, opacity: onMoveUp ? 1 : 0.3, cursor: onMoveUp ? 'pointer' : 'default' }}
              >
                <ChevronUp size={13} color="#5B6B62" />
              </button>
              <button
                aria-label={`Bajar ${section.label}`}
                onClick={onMoveDown || undefined}
                disabled={!onMoveDown}
                style={{ ...styles.moveBtn, opacity: onMoveDown ? 1 : 0.3, cursor: onMoveDown ? 'pointer' : 'default' }}
              >
                <ChevronDown size={13} color="#5B6B62" />
              </button>
            </div>
          )}
          {onRemoveSection && (
            <button aria-label={`Eliminar ${section.label}`} onClick={onRemoveSection} style={styles.removeSectionBtn}>
              <X size={13} color="#9BA69C" />
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p style={styles.emptyState}>Aún no has registrado nada aquí.</p>
      ) : (
        <ul style={styles.entryList}>
          {entries.map((f) =>
            editingId === f.id ? (
              <li key={f.id} style={{ listStyle: 'none' }}>
                <AddFoodForm
                  mode="edit"
                  initial={baseFromEntry(f)}
                  currentMeal={section.id}
                  allSections={allSections}
                  onCancel={() => setEditingId(null)}
                  onSave={(food, saveAsFavorite, targetSectionId) => { onEdit(f.id, food, targetSectionId); setEditingId(null); }}
                  onDelete={() => { onRemove(f.id); setEditingId(null); }}
                  favorites={favorites}
                  onQuickAdd={onQuickAdd}
                  onRemoveFavorite={onRemoveFavorite}
                />
              </li>
            ) : (
              <li key={f.id} style={styles.entryRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.entryName}>{f.name}</p>
                  <p style={styles.entryMacros}>
                    {f.quantity ? `${f.quantity} ${f.unit === 'unidad' ? 'ud' : 'g'} · ` : ''}{round(f.carbs)}g C · {round(f.protein)}g P · {round(f.fat)}g G
                  </p>
                </div>
                <span style={styles.entryKcal}>{Math.round(f.calories)}</span>
                <button aria-label={`Editar ${f.name}`} onClick={() => setEditingId(f.id)} style={styles.editBtn}>
                  <Pencil size={12} color="#2F6F5E" />
                </button>
                <button aria-label={`Eliminar ${f.name}`} onClick={() => onRemove(f.id)} style={styles.deleteBtn}>
                  <X size={14} color="#FBFAF6" />
                </button>
              </li>
            )
          )}
        </ul>
      )}

      {!open ? (
        <button onClick={onToggleOpen} style={styles.addLink}>
          <Plus size={15} style={{ marginRight: 4, verticalAlign: -3 }} />
          Añadir alimento
        </button>
      ) : (
        <AddFoodForm
          mode="add"
          onCancel={onToggleOpen}
          onSave={onAdd}
          favorites={favorites}
          onQuickAdd={onQuickAdd}
          onRemoveFavorite={onRemoveFavorite}
        />
      )}
    </section>
  );
}

function computeTotals(base, quantity, unit) {
  const q = n(quantity);
  const factor = unit === 'unidad' ? q : q / 100;
  return {
    calories: round(n(base.calories) * factor),
    carbs: round(n(base.carbs) * factor),
    protein: round(n(base.protein) * factor),
    fat: round(n(base.fat) * factor),
  };
}

function AddFoodForm({ onCancel, onSave, onDelete, favorites, onQuickAdd, onRemoveFavorite, initial, mode = 'add', currentMeal, allSections }) {
  const [name, setName] = useState(initial?.name || '');
  const [unit, setUnit] = useState(initial?.unit || 'g');
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '100');
  const [baseCalories, setBaseCalories] = useState(initial ? String(initial.baseCalories) : '');
  const [baseCarbs, setBaseCarbs] = useState(initial ? String(initial.baseCarbs) : '');
  const [baseProtein, setBaseProtein] = useState(initial ? String(initial.baseProtein) : '');
  const [baseFat, setBaseFat] = useState(initial ? String(initial.baseFat) : '');
  const [targetMeal, setTargetMeal] = useState(currentMeal || (allSections && allSections[0] ? allSections[0].id : 'desayuno'));
  const [saveFav, setSaveFav] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');

  const total = computeTotals(
    { calories: baseCalories, carbs: baseCarbs, protein: baseProtein, fat: baseFat },
    quantity,
    unit
  );

  function handleUnitChange(newUnit) {
    setUnit(newUnit);
    setQuantity(newUnit === 'unidad' ? '1' : '100');
    setSearchNote('');
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Escribe el nombre del alimento.');
      return;
    }
    if (baseCalories === '' || Number(baseCalories) < 0) {
      setError(unit === 'unidad' ? 'Ingresa las calorías por unidad.' : 'Ingresa las calorías por 100 g.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setError('Ingresa una cantidad válida.');
      return;
    }
    onSave(
      { name, quantity, unit, calories: total.calories, carbs: total.carbs, protein: total.protein, fat: total.fat },
      saveFav,
      targetMeal
    );
  }

  async function handleSearch() {
    if (!name.trim()) {
      setError('Escribe primero el nombre del alimento.');
      return;
    }
    setSearching(true);
    setError('');
    setSearchNote('');
    try {
      const portionInstruction =
        unit === 'unidad'
          ? 'Los valores SIEMPRE deben normalizarse a 1 unidad típica del alimento indicado (por ejemplo, 1 huevo, 1 pan, 1 tostada), sin importar si el nombre menciona otra cantidad.'
          : 'Los valores SIEMPRE deben normalizarse a una porción de 100 gramos del alimento, sin importar si el nombre menciona otra cantidad.';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system:
            `Eres una base de datos nutricional especializada en alimentos y platos de Perú (pan francés, camote, chicha morada, arroz con pollo, aji de gallina, papa a la huancaina, quinua, choclo, etc.), además de alimentos genéricos. Dado el nombre de un alimento, respondes SOLO con un objeto JSON compacto, sin texto adicional, sin markdown ni backticks, con exactamente este formato: {"calories":number,"carbs":number,"protein":number,"fat":number}. Interpreta el alimento como lo entendería alguien en Perú (por ejemplo "pan" sin más contexto es pan francés/pan de agua). ${portionInstruction} Usa números (no strings), redondeados a un decimal.`,
          messages: [{ role: 'user', content: name }],
        }),
      });
      const data = await response.json();
      const text = (data.content || []).map((b) => b.text || '').join('').trim();
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setBaseCalories(String(parsed.calories ?? ''));
      setBaseCarbs(String(parsed.carbs ?? ''));
      setBaseProtein(String(parsed.protein ?? ''));
      setBaseFat(String(parsed.fat ?? ''));
      setSearchNote(unit === 'unidad' ? 'Valores estimados por unidad. Ajusta la cantidad abajo.' : 'Valores estimados por 100 g. Ajusta la cantidad abajo.');
    } catch (e) {
      setError('No se pudo estimar. Ingresa los valores manualmente.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={styles.formWrap}>
      {mode === 'add' && favorites.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={styles.favTitle}>Tus frecuentes</p>
          <div style={styles.favChipRow}>
            {favorites.map((f) => (
              <div key={f.name} style={styles.favChip}>
                <button onClick={() => onQuickAdd(f)} style={styles.favChipBtn}>
                  <Star size={12} color="#E8A33D" style={{ marginRight: 5, verticalAlign: -2 }} fill="#E8A33D" />
                  {f.name}
                  <span style={styles.favChipKcal}>{Math.round(f.calories)} kcal</span>
                </button>
                <button aria-label={`Quitar ${f.name} de frecuentes`} onClick={() => onRemoveFavorite(f.name)} style={styles.favChipRemove}>
                  <X size={11} color="#9BA69C" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.nameSearchRow}>
        <input
          type="text"
          placeholder="Ej. pan, 2 rebanadas"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); setSearchNote(''); }}
          style={{ ...styles.textInput, marginBottom: 0, flex: 1 }}
        />
        <button onClick={handleSearch} disabled={searching} style={styles.searchBtn}>
          {searching ? 'Buscando…' : 'Estimar'}
        </button>
      </div>
      {searchNote && <p style={styles.searchNote}>{searchNote}</p>}

      <div style={styles.unitToggleRow}>
        <button
          type="button"
          onClick={() => handleUnitChange('g')}
          style={{ ...styles.unitToggleBtn, ...(unit === 'g' ? styles.unitToggleBtnActive : {}) }}
        >
          Gramos
        </button>
        <button
          type="button"
          onClick={() => handleUnitChange('unidad')}
          style={{ ...styles.unitToggleBtn, ...(unit === 'unidad' ? styles.unitToggleBtnActive : {}) }}
        >
          Unidades
        </button>
      </div>

      <label style={styles.quantityField}>
        <span style={styles.miniLabel}>{unit === 'unidad' ? 'Cantidad (unidades)' : 'Cantidad (g)'}</span>
        <input
          type="number"
          min="0"
          step={unit === 'unidad' ? '1' : 'any'}
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setError(''); }}
          style={styles.numInputSmall}
        />
      </label>

      <p style={styles.baseLabel}>{unit === 'unidad' ? 'Valores por unidad' : 'Valores por 100 g'}</p>
      <div style={styles.formGrid}>
        <label style={styles.miniField}>
          <span style={styles.miniLabel}>Calorías</span>
          <input type="number" min="0" value={baseCalories} onChange={(e) => { setBaseCalories(e.target.value); setError(''); }} style={styles.numInputSmall} />
        </label>
        <label style={styles.miniField}>
          <span style={{ ...styles.miniLabel, color: MACRO_COLORS.carbs }}>Carbos (g)</span>
          <input type="number" min="0" value={baseCarbs} onChange={(e) => setBaseCarbs(e.target.value)} style={styles.numInputSmall} />
        </label>
        <label style={styles.miniField}>
          <span style={{ ...styles.miniLabel, color: MACRO_COLORS.protein }}>Proteína (g)</span>
          <input type="number" min="0" value={baseProtein} onChange={(e) => setBaseProtein(e.target.value)} style={styles.numInputSmall} />
        </label>
        <label style={styles.miniField}>
          <span style={{ ...styles.miniLabel, color: MACRO_COLORS.fat }}>Grasa (g)</span>
          <input type="number" min="0" value={baseFat} onChange={(e) => setBaseFat(e.target.value)} style={styles.numInputSmall} />
        </label>
      </div>

      <div style={styles.totalBox}>
        <span style={styles.totalLabel}>
          Total para {quantity || 0} {unit === 'unidad' ? (Number(quantity) === 1 ? 'unidad' : 'unidades') : 'g'}
        </span>
        <span style={styles.totalValue}>
          {total.calories} kcal · {total.carbs}g C · {total.protein}g P · {total.fat}g G
        </span>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {mode === 'edit' && (
        <label style={styles.moveField}>
          <span style={styles.miniLabel}>Mover a</span>
          <select value={targetMeal} onChange={(e) => setTargetMeal(e.target.value)} style={styles.selectInput}>
            {(allSections || []).map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      )}

      {mode === 'add' && (
        <label style={styles.favCheckRow}>
          <input type="checkbox" checked={saveFav} onChange={(e) => setSaveFav(e.target.checked)} style={{ marginRight: 7 }} />
          Guardar en frecuentes para añadir con un toque
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={handleSave} style={styles.primaryBtn}>
          <Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
          {mode === 'edit' ? 'Guardar cambios' : 'Guardar'}
        </button>
        <button onClick={onCancel} style={styles.ghostBtn}>Cancelar</button>
        {mode === 'edit' && onDelete && (
          <button onClick={onDelete} style={styles.deleteTextBtn}>
            <Trash2 size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`;

const EXTRA_CSS = `
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { opacity: 0.4; }
  input:focus, button:focus-visible { outline: 2px solid #2F6F5E; outline-offset: 1px; }
`;

const styles = {
  page: {
    background: '#FBFAF6',
    minHeight: '100%',
    padding: '24px 12px 60px',
    fontFamily: 'Inter, sans-serif',
    color: '#1F2A24',
  },
  container: { maxWidth: 440, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  wordmark: { fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 28, fontWeight: 600, margin: 0, color: '#1F2A24' },
  tagline: { fontSize: 12.5, color: '#5B6B62', margin: '2px 0 0' },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, border: '1px solid #DDE3DA', background: '#FFFFFF',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  goalsPanel: {
    background: '#FFFFFF', border: '1px solid #E4E8DE', borderRadius: 18, padding: '16px 18px', marginBottom: 16,
  },
  panelTitle: { fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 16, margin: '0 0 12px' },
  goalsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  goalField: { display: 'flex', flexDirection: 'column', gap: 4 },
  goalFieldLabel: { fontSize: 11.5, fontWeight: 600 },
  numInput: {
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 10px', borderRadius: 9,
    border: '1px solid #DDE3DA', background: '#FBFAF6', color: '#1F2A24',
  },
  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  navBtn: {
    width: 34, height: 34, borderRadius: '50%', border: '1px solid #DDE3DA', background: '#FFFFFF',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  datePill: {
    display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1px solid #DDE3DA',
    borderRadius: 999, padding: '8px 16px', fontSize: 13.5, fontWeight: 500, color: '#1F2A24', gap: 2,
  },
  todayBadge: {
    marginLeft: 8, background: '#E4EFEA', color: '#2F6F5E', fontSize: 10.5, fontWeight: 700,
    padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  heroCard: {
    background: '#FFFFFF', border: '1px solid #E4E8DE', borderRadius: 22, padding: '22px 18px', marginBottom: 18,
  },
  macroLegend: { marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 },
  macroLegendItem: { display: 'flex', alignItems: 'center', gap: 10 },
  macroDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  macroLegendLabel: { fontSize: 12.5, margin: 0, color: '#1F2A24', fontWeight: 500 },
  macroLegendValue: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, margin: '1px 0 0', color: '#5B6B62' },
  macroBarTrack: { width: 74, height: 6, borderRadius: 999, background: '#E4E8DE', overflow: 'hidden', flexShrink: 0 },
  macroBarFill: { height: '100%', borderRadius: 999 },
  mealCard: {
    background: '#FFFFFF', border: '1px solid #E4E8DE', borderRadius: 18, padding: '16px 18px', marginBottom: 14,
  },
  mealHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  removeSectionBtn: {
    width: 20, height: 20, borderRadius: '50%', background: '#F0F2EC', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  moveBtnGroup: { display: 'flex', flexDirection: 'column', gap: 1 },
  moveBtn: {
    width: 18, height: 14, border: 'none', background: 'none', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  addSnackBtn: {
    width: '100%', background: '#FFFFFF', border: '1px dashed #C9D4CC', borderRadius: 18,
    color: '#2F6F5E', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '13px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  mealTitle: { fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 17, margin: 0, color: '#1F2A24' },
  mealTotalKcal: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#5B6B62' },
  emptyState: { fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 13.5, color: '#9BA69C', margin: '6px 0 12px' },
  entryList: { listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  entryRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #F0F2EC',
  },
  entryName: { fontSize: 13.5, margin: 0, color: '#1F2A24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  entryMacros: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, margin: '2px 0 0', color: '#9BA69C' },
  entryKcal: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#1F2A24', flexShrink: 0 },
  deleteBtn: {
    width: 22, height: 22, borderRadius: '50%', background: '#C1583F', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  editBtn: {
    width: 22, height: 22, borderRadius: '50%', background: '#E4EFEA', border: '1px solid #C9DED4',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  deleteTextBtn: {
    background: 'none', border: 'none', color: '#C1583F', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: 'auto',
  },
  addLink: {
    background: 'none', border: 'none', color: '#2F6F5E', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center',
  },
  formWrap: { marginTop: 6, paddingTop: 12, borderTop: '1px solid #F0F2EC' },
  favTitle: { fontSize: 11, fontWeight: 700, color: '#9BA69C', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' },
  favChipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  favChip: {
    display: 'flex', alignItems: 'center', background: '#FCEED9', borderRadius: 999, overflow: 'hidden',
  },
  favChipBtn: {
    background: 'none', border: 'none', padding: '7px 10px', fontSize: 12.5, color: '#8A5A16',
    cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 500,
  },
  favChipKcal: { marginLeft: 6, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: '#B0803A' },
  favChipRemove: { background: 'none', border: 'none', padding: '0 8px 0 0', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  textInput: {
    width: '100%', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid #DDE3DA',
    background: '#FBFAF6', color: '#1F2A24', marginBottom: 10, boxSizing: 'border-box',
  },
  nameSearchRow: { display: 'flex', gap: 8, alignItems: 'stretch' },
  searchBtn: {
    background: '#E4EFEA', color: '#2F6F5E', border: '1px solid #C9DED4', borderRadius: 10,
    padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
  },
  searchNote: { fontSize: 11.5, color: '#B0803A', margin: '6px 0 0' },
  quantityField: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxWidth: 140 },
  moveField: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, maxWidth: 200 },
  selectInput: {
    fontFamily: 'Inter, sans-serif', fontSize: 13.5, padding: '8px 10px', borderRadius: 9,
    border: '1px solid #DDE3DA', background: '#FBFAF6', color: '#1F2A24',
  },
  unitToggleRow: { display: 'flex', gap: 6, marginTop: 12 },
  unitToggleBtn: {
    flex: 1, padding: '7px 0', borderRadius: 9, border: '1px solid #DDE3DA', background: '#FBFAF6',
    color: '#5B6B62', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  unitToggleBtnActive: { background: '#2F6F5E', borderColor: '#2F6F5E', color: '#FBFAF6' },
  baseLabel: { fontSize: 11, fontWeight: 700, color: '#9BA69C', textTransform: 'uppercase', letterSpacing: 0.4, margin: '14px 0 8px' },
  totalBox: {
    marginTop: 12, background: '#E4EFEA', borderRadius: 10, padding: '10px 12px',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  totalLabel: { fontSize: 11, fontWeight: 700, color: '#2F6F5E', textTransform: 'uppercase', letterSpacing: 0.3 },
  totalValue: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#1F2A24' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  miniField: { display: 'flex', flexDirection: 'column', gap: 4 },
  miniLabel: { fontSize: 11, fontWeight: 600, color: '#5B6B62' },
  numInputSmall: {
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, padding: '7px 9px', borderRadius: 9,
    border: '1px solid #DDE3DA', background: '#FBFAF6', color: '#1F2A24', boxSizing: 'border-box', width: '100%',
  },
  errorText: { color: '#C1583F', fontSize: 12, margin: '8px 0 0' },
  favCheckRow: { display: 'flex', alignItems: 'center', fontSize: 12.5, color: '#5B6B62', marginTop: 12, cursor: 'pointer' },
  primaryBtn: {
    background: '#2F6F5E', color: '#FBFAF6', border: 'none', borderRadius: 10, padding: '9px 16px',
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  ghostBtn: {
    background: 'none', color: '#5B6B62', border: '1px solid #DDE3DA', borderRadius: 10, padding: '9px 16px',
    fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
  },
  footerNote: { textAlign: 'center', fontSize: 11, color: '#9BA69C', marginTop: 20 },
  toast: {
    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    background: '#1F2A24', color: '#FBFAF6', padding: '10px 18px', borderRadius: 999,
    fontSize: 13, fontFamily: 'Inter, sans-serif', boxShadow: '0 6px 18px rgba(0,0,0,0.18)', zIndex: 50,
  },
};
