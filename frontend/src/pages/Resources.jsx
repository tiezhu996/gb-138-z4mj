import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { regions, serviceTypes } from '../data/resources';

const RESULT_META = {
  available: { label: '接通有床', badge: 'bg-green-100 text-green-700 border-green-200' },
  unavailable: { label: '接通没床', badge: 'bg-stone-200 text-stone-500 border-stone-300' },
  no_answer: { label: '没人接', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
};

const ResultBadge = ({ result }) => {
  const meta = RESULT_META[result];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${meta.badge}`}>
      {meta.label}
    </span>
  );
};

// 在卡片上登记一次联系：谁打的、结果、一句备注
const ContactForm = ({ institutionId, knownCallers, onSaved, onCancel }) => {
  const [caller, setCaller] = useState('');
  const [result, setResult] = useState('available');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!caller.trim()) {
      setError('请填写是谁打的电话');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/institutions/${institutionId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: caller.trim(), result, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败，请稍后再试');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-inner">
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-2">谁打的电话</label>
          <input
            type="text"
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
            placeholder="如：大姐、二舅"
            maxLength={30}
            list="known-callers"
            className="w-full px-4 py-3 rounded-xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all outline-none bg-white"
          />
          <datalist id="known-callers">
            {knownCallers.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-2">结果</label>
          <div className="flex gap-2">
            {Object.entries(RESULT_META).map(([value, meta]) => (
              <button
                key={value}
                type="button"
                onClick={() => setResult(value)}
                className={`flex-1 px-2 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  result === value
                    ? 'border-amber-500 bg-amber-50 text-warm-800 shadow-sm'
                    : 'border-warm-100 bg-white text-warm-400 hover:border-amber-200'
                }`}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-semibold text-warm-700 mb-2">一句备注</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如：说下周三会有床空出来，让上午再确认"
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all outline-none bg-white"
        />
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {submitting ? '保存中…' : '保存这次联系'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-3 bg-warm-100 text-warm-600 rounded-xl font-semibold hover:bg-warm-200 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
};

// 同一家机构的每一次联系都单独留着，新的在前
const ContactHistory = ({ institutionId }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/institutions/${institutionId}/contacts`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(data.contacts || []);
      })
      .catch(() => {
        if (!cancelled) setError('记录加载失败，请稍后再试');
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  if (error) return <p className="mt-3 text-sm text-red-500">{error}</p>;
  if (items === null) return <p className="mt-3 text-sm text-warm-400">记录加载中…</p>;
  if (items.length === 0) return <p className="mt-3 text-sm text-warm-400">还没有联系记录。</p>;

  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white/70 rounded-xl px-4 py-3 text-sm border border-warm-100"
        >
          <span className="text-warm-400 whitespace-nowrap">{formatTime(item.createdAt)}</span>
          <span className="font-semibold text-warm-700">{item.caller}</span>
          <ResultBadge result={item.result} />
          {item.note && <span className="text-warm-500 break-all">{item.note}</span>}
        </li>
      ))}
    </ul>
  );
};

const Resources = () => {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [formOpenFor, setFormOpenFor] = useState(null);
  const [historyOpenFor, setHistoryOpenFor] = useState(null);
  const [actionError, setActionError] = useState('');

  // 登记联系、谈妥标记变更后 bump 这个值，重新拉取排好序的台账
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/institutions')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载失败');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setInstitutions(data.institutions || []);
        setLoadError('');
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('名单加载失败，请检查服务是否已启动，然后重试。');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const toggleConfirmed = async (inst) => {
    setActionError('');
    try {
      const res = await fetch(`/api/institutions/${inst.id}/confirmed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: !inst.confirmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 家里人都用过哪些称呼，登记时直接选
  const knownCallers = useMemo(() => {
    const names = institutions.map((i) => i.lastContact?.caller).filter(Boolean);
    return [...new Set(names)];
  }, [institutions]);

  const summary = useMemo(() => {
    const total = { confirmed: 0, available: 0, pending: 0, unavailable: 0 };
    for (const inst of institutions) {
      if (inst.confirmed) total.confirmed += 1;
      else if (inst.lastContact?.result === 'available') total.available += 1;
      else if (inst.lastContact?.result === 'unavailable') total.unavailable += 1;
      else total.pending += 1;
    }
    return total;
  }, [institutions]);

  // 服务端已按台账规则排好序（谈妥 > 有床 > 待联系 > 没床），筛选不打乱顺序
  const filteredInstitutions = useMemo(() => {
    return institutions.filter((inst) => {
      const matchRegion = selectedRegion === 'all' || inst.region === selectedRegion;
      const matchSearch = inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchServices = selectedServices.length === 0 ||
        selectedServices.some((s) => inst.services.includes(s));
      return matchRegion && matchSearch && matchServices;
    });
  }, [institutions, selectedRegion, searchQuery, selectedServices]);

  const toggleService = (service) => {
    if (selectedServices.includes(service)) {
      setSelectedServices(selectedServices.filter((s) => s !== service));
    } else {
      setSelectedServices([...selectedServices, service]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-warm-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
        <div className="absolute top-40 right-20 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-warm-200/30 rounded-full blur-3xl" />
      </div>

      <header className="relative bg-white/70 backdrop-blur-md shadow-sm sticky top-0 z-20 border-b border-white/50">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2.5 hover:bg-warm-100 rounded-full transition-colors group"
            >
              <svg className="w-6 h-6 text-warm-600 group-hover:text-amber-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-warm-800">资源对接 · 家庭台账</h1>
              <p className="text-xs text-warm-500">全家共用，谁打过电话、结果如何都记在这里</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold text-warm-900 mb-4">
            床位联系台账
          </h2>
          <p className="text-lg text-warm-600 max-w-2xl mx-auto leading-relaxed">
            每联系一家就登记一次，换台手机打开看到的都是一样的记录。
            已谈妥的排在最前，暂时没床的沉在最后，有床了会自动翻回前面。
          </p>
        </div>

        {!loading && !loadError && (
          <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg px-8 py-5 mb-8 border border-white/60 flex flex-wrap gap-x-8 gap-y-2 justify-center text-warm-700">
            <span>⭐ 已谈妥 <b className="text-amber-600">{summary.confirmed}</b> 家</span>
            <span>🛏️ 接通有床 <b className="text-green-600">{summary.available}</b> 家</span>
            <span>📞 待联系/没人接 <b className="text-warm-500">{summary.pending}</b> 家</span>
            <span>🕐 暂时没床 <b className="text-stone-500">{summary.unavailable}</b> 家</span>
          </div>
        )}

        <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-8 mb-10 border border-white/60">
          <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
          </div>
          <div className="relative grid md:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-warm-700 mb-3">
                选择地区
              </label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all outline-none bg-white/50 text-lg"
              >
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-warm-700 mb-3">
                搜索机构
              </label>
              <div className="relative">
                <svg className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="输入机构名称或地址关键词..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-16 pr-5 py-4 rounded-2xl border-2 border-amber-100 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all outline-none bg-white/50 text-lg"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-4">
              服务类型筛选
            </label>
            <div className="flex flex-wrap gap-3">
              {serviceTypes.map((service) => (
                <button
                  key={service}
                  onClick={() => toggleService(service)}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                    selectedServices.includes(service)
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                      : 'bg-white/60 text-warm-600 hover:bg-amber-50 border border-warm-200'
                  }`}
                >
                  {service}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between px-2">
          <p className="text-warm-600 text-lg">
            共找到 <span className="font-bold text-amber-600 text-xl">{filteredInstitutions.length}</span> 家机构
          </p>
          {(selectedRegion !== 'all' || searchQuery || selectedServices.length > 0) && (
            <button
              onClick={() => {
                setSelectedRegion('all');
                setSearchQuery('');
                setSelectedServices([]);
              }}
              className="text-sm text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
            >
              <span>🔄</span>
              <span>清除筛选</span>
            </button>
          )}
        </div>

        {actionError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-6 py-4">
            {actionError}
          </div>
        )}

        {loading && (
          <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-16 text-center border border-white/60">
            <p className="text-warm-500 text-lg">台账加载中…</p>
          </div>
        )}

        {loadError && (
          <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-16 text-center border border-white/60">
            <div className="text-6xl mb-4">🔌</div>
            <p className="text-warm-600 text-lg mb-6">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError('');
                reload();
              }}
              className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold hover:shadow-lg transition-all"
            >
              重新加载
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <div className="space-y-5">
            {filteredInstitutions.length === 0 ? (
              <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-16 text-center border border-white/60 overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 opacity-10">
                  <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
                </div>
                <div className="relative">
                  <div className="text-7xl mb-6">🔍</div>
                  <h3 className="text-2xl font-bold text-warm-800 mb-3">
                    未找到匹配的机构
                  </h3>
                  <p className="text-warm-500 text-lg">
                    请尝试调整筛选条件或搜索关键词
                  </p>
                </div>
              </div>
            ) : (
              filteredInstitutions.map((inst) => (
                <div
                  key={inst.id}
                  className={`group relative bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border overflow-hidden ${
                    inst.confirmed
                      ? 'border-amber-300 ring-2 ring-amber-200'
                      : 'border-white/60 hover:-translate-y-1'
                  }`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
                  </div>
                  <div className="relative">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <h3 className="text-2xl font-bold text-warm-800 group-hover:text-amber-600 transition-colors">
                        {inst.name}
                      </h3>
                      {inst.confirmed && (
                        <span className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-bold shadow-md">
                          ⭐ 已谈妥{inst.confirmedAt ? ` · ${formatTime(inst.confirmedAt)}` : ''}
                        </span>
                      )}
                      <span className="px-4 py-1.5 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 rounded-full text-sm font-semibold">
                        {inst.type}
                      </span>
                      <span className="px-4 py-1.5 bg-warm-100 text-warm-600 rounded-full text-sm font-semibold">
                        {regions.find((r) => r.id === inst.region)?.name}
                      </span>
                    </div>
                    <p className="text-warm-600 mb-5 leading-relaxed">
                      {inst.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {inst.services.map((service, index) => (
                        <span
                          key={index}
                          className="px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-5 text-base text-warm-500 mb-5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📍</span>
                        <span>{inst.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📞</span>
                        <a
                          href={`tel:${inst.phone}`}
                          className="text-amber-600 hover:text-amber-700 font-semibold"
                        >
                          {inst.phone}
                        </a>
                      </div>
                    </div>

                    <div className={`rounded-2xl px-5 py-4 mb-4 ${
                      inst.lastContact?.result === 'unavailable' && !inst.confirmed
                        ? 'bg-stone-100/80'
                        : 'bg-amber-50/80'
                    }`}>
                      {inst.lastContact ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="text-sm text-warm-500">最近联系</span>
                          <ResultBadge result={inst.lastContact.result} />
                          <span className="font-semibold text-warm-700">{inst.lastContact.caller}</span>
                          <span className="text-sm text-warm-400">{formatTime(inst.lastContact.createdAt)}</span>
                          {inst.lastContact.note && (
                            <span className="text-sm text-warm-500 break-all">「{inst.lastContact.note}」</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-warm-400">还没联系过，方便的话打个电话问问床位。</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href={`tel:${inst.phone}`}
                        className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <span>📞</span>
                        <span>打电话</span>
                      </a>
                      <button
                        onClick={() => setFormOpenFor(formOpenFor === inst.id ? null : inst.id)}
                        className="px-5 py-3 bg-white text-amber-600 border-2 border-amber-300 rounded-xl font-bold hover:bg-amber-50 transition-colors flex items-center gap-2"
                      >
                        <span>✏️</span>
                        <span>登记联系</span>
                      </button>
                      <button
                        onClick={() => setHistoryOpenFor(historyOpenFor === inst.id ? null : inst.id)}
                        className="px-5 py-3 bg-warm-100 text-warm-700 rounded-xl font-semibold hover:bg-amber-100 transition-colors"
                      >
                        联系记录{inst.contactCount > 0 ? ` ${inst.contactCount} 条` : ''}{historyOpenFor === inst.id ? ' ▴' : ' ▾'}
                      </button>
                      <button
                        onClick={() => toggleConfirmed(inst)}
                        className={`px-5 py-3 rounded-xl font-semibold transition-colors ${
                          inst.confirmed
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-warm-100 text-warm-700 hover:bg-amber-100'
                        }`}
                      >
                        {inst.confirmed ? '↩︎ 取消谈妥' : '⭐ 标为已谈妥'}
                      </button>
                    </div>

                    {formOpenFor === inst.id && (
                      <ContactForm
                        institutionId={inst.id}
                        knownCallers={knownCallers}
                        onSaved={() => {
                          setFormOpenFor(null);
                          reload();
                        }}
                        onCancel={() => setFormOpenFor(null)}
                      />
                    )}

                    {historyOpenFor === inst.id && (
                      <ContactHistory
                        key={`${inst.id}-${inst.contactCount}`}
                        institutionId={inst.id}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

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

export default Resources;
