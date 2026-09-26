import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { regions, institutions } from '../data/resources';

const RESULTS = {
  available: { label: '接通有床', chip: 'bg-green-100 text-green-700 border border-green-200' },
  unavailable: { label: '接通没床', chip: 'bg-gray-200 text-gray-500 border border-gray-300' },
  no_answer: { label: '没人接', chip: 'bg-amber-100 text-amber-700 border border-amber-200' },
};

const RESULT_OPTIONS = [
  { value: 'available', label: '✅ 接通有床' },
  { value: 'unavailable', label: '🚫 接通没床' },
  { value: 'no_answer', label: '📵 没人接' },
];

// 排序分组：已谈好最前，有床其次，未联系/没人接居中，暂时没床沉底
const rankOf = (entry) => {
  if (entry?.agreed) return 0;
  if (!entry?.lastContact) return 2;
  if (entry.lastContact.result === 'available') return 1;
  if (entry.lastContact.result === 'unavailable') return 3;
  return 2;
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Ledger = () => {
  const [entries, setEntries] = useState({});
  const [loadError, setLoadError] = useState('');
  const [formFor, setFormFor] = useState(null);
  const [caller, setCaller] = useState(() => localStorage.getItem('ledgerCaller') || '');
  const [note, setNote] = useState('');
  const [result, setResult] = useState('available');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ledger');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const map = {};
      data.entries.forEach((entry) => {
        map[entry.institutionId] = entry;
      });
      setEntries(map);
      setLoadError('');
    } catch {
      setLoadError('台账暂时连不上，请确认服务已启动，稍后会自动重试');
    }
  }, []);

  useEffect(() => {
    // 首次加载放到微任务里，避免在 effect 里同步 setState
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const cards = useMemo(() => {
    return institutions
      .map((inst) => ({ inst, entry: entries[inst.id] }))
      .sort((a, b) => {
        const rankDiff = rankOf(a.entry) - rankOf(b.entry);
        if (rankDiff !== 0) return rankDiff;
        const timeA = a.entry?.lastContact ? new Date(a.entry.lastContact.at).getTime() : 0;
        const timeB = b.entry?.lastContact ? new Date(b.entry.lastContact.at).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.inst.id - b.inst.id;
      });
  }, [entries]);

  const stats = useMemo(() => {
    const all = Object.values(entries);
    return {
      agreed: all.filter((e) => e.agreed).length,
      available: all.filter((e) => !e.agreed && e.lastContact?.result === 'available').length,
      unavailable: all.filter((e) => !e.agreed && e.lastContact?.result === 'unavailable').length,
    };
  }, [entries]);

  const openForm = (inst) => {
    setFormFor(inst);
    setNote('');
    setResult('available');
    setFormError('');
  };

  const submitContact = async () => {
    if (!caller.trim()) {
      setFormError('请填写是谁打的电话');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/ledger/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: formFor.id,
          caller: caller.trim(),
          note: note.trim(),
          result,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      localStorage.setItem('ledgerCaller', caller.trim());
      setFormFor(null);
      await load();
      if (historyFor === formFor.id) {
        fetchHistory(formFor.id);
      }
    } catch (err) {
      setFormError(`保存失败：${err.message}，请重试`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAgreed = async (inst, agreed) => {
    try {
      const res = await fetch(`/api/ledger/institutions/${inst.id}/agreed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      setLoadError('标记失败，请重试');
    }
  };

  const fetchHistory = async (institutionId) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ledger/contacts?institutionId=${institutionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data.contacts);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = (institutionId) => {
    if (historyFor === institutionId) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(institutionId);
    fetchHistory(institutionId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-warm-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
        <div className="absolute top-40 right-20 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl" />
      </div>

      <header className="relative bg-white/70 backdrop-blur-md shadow-sm sticky top-0 z-20 border-b border-white/50">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-4">
            <Link
              to="/resources"
              className="p-2.5 hover:bg-warm-100 rounded-full transition-colors group"
            >
              <svg className="w-6 h-6 text-warm-600 group-hover:text-amber-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-warm-800">床位台账</h1>
              <p className="text-xs text-warm-500">全家共用 · 换设备、重启服务都在</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="px-4 py-2 bg-amber-500 text-white rounded-full text-sm font-bold shadow">
            🤝 已谈好 {stats.agreed}
          </span>
          <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-semibold border border-green-200">
            ✅ 有床 {stats.available}
          </span>
          <span className="px-4 py-2 bg-gray-200 text-gray-500 rounded-full text-sm font-semibold border border-gray-300">
            🚫 暂时没床 {stats.unavailable}
          </span>
          <span className="ml-auto text-sm text-warm-400">每 30 秒自动刷新，家人登记的内容会同步出现</span>
        </div>

        {loadError && (
          <div className="mb-6 px-5 py-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl text-sm font-medium">
            {loadError}
          </div>
        )}

        <div className="space-y-5">
          {cards.map(({ inst, entry }) => {
            const agreed = Boolean(entry?.agreed);
            const last = entry?.lastContact;
            const sunk = !agreed && last?.result === 'unavailable';
            return (
              <div
                key={inst.id}
                className={`relative rounded-3xl p-6 md:p-8 border transition-all duration-300 ${
                  agreed
                    ? 'bg-amber-50/90 border-amber-300 shadow-xl ring-2 ring-amber-300'
                    : sunk
                      ? 'bg-white/50 border-white/60 shadow opacity-75'
                      : 'bg-white/80 border-white/60 shadow-lg'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-5">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3 className="text-xl font-bold text-warm-800">{inst.name}</h3>
                      {agreed && (
                        <span className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-bold shadow">
                          🤝 已谈好
                        </span>
                      )}
                      {last && (
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${RESULTS[last.result].chip}`}>
                          {RESULTS[last.result].label}
                        </span>
                      )}
                      {!last && (
                        <span className="px-3 py-1 bg-warm-100 text-warm-400 rounded-full text-sm">
                          还没联系过
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-warm-500 mb-3">
                      <span>{regions.find((r) => r.id === inst.region)?.name} · {inst.type}</span>
                      <a href={`tel:${inst.phone}`} className="text-amber-600 font-semibold hover:text-amber-700">
                        📞 {inst.phone}
                      </a>
                    </div>

                    {last && (
                      <p className="text-sm text-warm-600">
                        最近：{formatTime(last.at)} · {last.caller} 打的
                        {last.note && <span className="text-warm-500"> · {last.note}</span>}
                        <span className="text-warm-400">（共联系 {entry.contactCount || 1} 次）</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap md:flex-col gap-2 md:min-w-[150px]">
                    <button
                      onClick={() => openForm(inst)}
                      className="flex-1 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold hover:shadow-lg transition-all text-sm"
                    >
                      ✏️ 登记联系
                    </button>
                    <button
                      onClick={() => toggleAgreed(inst, !agreed)}
                      className={`flex-1 px-5 py-3 rounded-2xl font-bold transition-colors text-sm ${
                        agreed
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-warm-100 text-warm-600 hover:bg-amber-100'
                      }`}
                    >
                      {agreed ? '↩️ 取消谈好' : '🤝 标为谈好'}
                    </button>
                    <button
                      onClick={() => toggleHistory(inst.id)}
                      className="flex-1 px-5 py-3 bg-white/70 text-warm-600 rounded-2xl font-semibold hover:bg-warm-100 transition-colors text-sm border border-warm-200"
                    >
                      {historyFor === inst.id ? '收起记录' : `联系记录${entry?.contactCount ? ` (${entry.contactCount})` : ''}`}
                    </button>
                  </div>
                </div>

                {historyFor === inst.id && (
                  <div className="mt-5 pt-5 border-t border-warm-200/70">
                    {historyLoading ? (
                      <p className="text-sm text-warm-400">正在读取记录…</p>
                    ) : history.length === 0 ? (
                      <p className="text-sm text-warm-400">还没有联系记录，点「登记联系」记下第一通电话。</p>
                    ) : (
                      <ul className="space-y-2">
                        {history.map((c) => (
                          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm bg-white/60 rounded-xl px-4 py-2.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${RESULTS[c.result].chip}`}>
                              {RESULTS[c.result].label}
                            </span>
                            <span className="text-warm-700 font-medium">{c.caller}</span>
                            <span className="text-warm-400">{formatTime(c.at)}</span>
                            {c.note && <span className="text-warm-500 w-full sm:w-auto">备注：{c.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {formFor && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-warm-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
            <h3 className="text-xl font-bold text-warm-800 mb-1">登记一次联系</h3>
            <p className="text-sm text-warm-500 mb-6">{formFor.name} · {formFor.phone}</p>

            <label className="block text-sm font-semibold text-warm-700 mb-2">谁打的电话</label>
            <input
              type="text"
              value={caller}
              onChange={(e) => setCaller(e.target.value)}
              placeholder="如：大女儿、表哥…"
              className="w-full px-4 py-3 rounded-2xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none mb-4 bg-white/80"
            />

            <label className="block text-sm font-semibold text-warm-700 mb-2">结果</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {RESULT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setResult(opt.value)}
                  className={`px-2 py-3 rounded-2xl text-sm font-semibold transition-all ${
                    result === opt.value
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow'
                      : 'bg-warm-100 text-warm-600 hover:bg-amber-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-semibold text-warm-700 mb-2">一句备注</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：说下周三可能有床，让再问问"
              className="w-full px-4 py-3 rounded-2xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none mb-4 bg-white/80"
            />

            {formError && (
              <p className="text-sm text-rose-600 mb-4">{formError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setFormFor(null)}
                className="flex-1 px-5 py-3 bg-warm-100 text-warm-600 rounded-2xl font-bold hover:bg-warm-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={submitContact}
                disabled={submitting}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="relative bg-gradient-to-r from-amber-800 to-orange-900 text-white/80 py-10 mt-20">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-2xl">🕊️</span>
            <span className="text-lg font-semibold text-white">安宁疗护信息指南</span>
          </div>
          <p className="text-sm text-white/50 max-w-xl mx-auto">
            本平台仅供信息参考，具体诊疗请遵医嘱。如有紧急情况，请立即就医。
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Ledger;
