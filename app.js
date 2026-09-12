(() => {
  'use strict';

  const SETTINGS_KEY = 'affitto.settings.v1';
  const PAYMENTS_KEY = 'affitto.payments.v1';
  const META_KEY = 'affitto.meta.v2';
  const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const EPS = 0.005;

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
  const todayISO = () => dateToISO(new Date());
  const todayDate = () => dateOnly(new Date());
  const dateToISO = (d) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const parseISO = (iso) => {
    if (!iso) return null;
    const parts = String(iso).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };
  const fmtDate = (isoOrDate) => {
    const d = isoOrDate instanceof Date ? isoOrDate : parseISO(isoOrDate);
    if (!d) return '';
    return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'long', year:'numeric' }).format(d);
  };
  const fmtShortDate = (isoOrDate) => {
    const d = isoOrDate instanceof Date ? isoOrDate : parseISO(isoOrDate);
    if (!d) return '';
    return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }).format(d);
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  let settings = loadJSON(SETTINGS_KEY, {});
  let payments = loadJSON(PAYMENTS_KEY, []);
  let meta = loadJSON(META_KEY, { receiptCounters: {} });
  let currentYear = new Date().getFullYear();
  let activePaymentId = null;
  let activeMonth = null;

  normalizeData();

  function defaultContractStart() {
    if (payments.length) {
      const first = [...payments].sort((a,b) => (a.year-b.year) || (a.month-b.month) || String(a.date).localeCompare(String(b.date)))[0];
      return `${first.year}-${String(first.month + 1).padStart(2,'0')}-01`;
    }
    return `${new Date().getFullYear()}-01-01`;
  }

  function normalizeData() {
    settings = {
      landlordName: settings.landlordName || '',
      tenantName: settings.tenantName || '',
      propertyAddress: settings.propertyAddress || '',
      monthlyRent: Number(settings.monthlyRent || 0),
      receiptPlace: settings.receiptPlace || '',
      dueDay: Math.min(28, Math.max(1, Number(settings.dueDay || 1))),
      contractStartDate: settings.contractStartDate || '',
      contractEndDate: settings.contractEndDate || '',
      depositAmount: Number(settings.depositAmount || 0),
      depositDate: settings.depositDate || ''
    };

    if (!Array.isArray(payments)) payments = [];
    payments = payments.map((p, index) => ({
      id: p.id || `legacy-${Date.now()}-${index}`,
      month: Number(p.month),
      year: Number(p.year),
      cashAmount: Number(p.cashAmount !== undefined ? p.cashAmount : (p.amount || 0)),
      depositAmount: Number(p.depositAmount || 0),
      date: p.date || todayISO(),
      notes: p.notes || '',
      tenantSignature: p.tenantSignature || '',
      landlordSignature: p.landlordSignature || '',
      createdAt: p.createdAt || `${p.date || todayISO()}T12:00:00.000Z`,
      receiptNumber: p.receiptNumber || ''
    })).filter(p => Number.isFinite(p.month) && p.month >= 0 && p.month <= 11 && Number.isFinite(p.year));

    if (!settings.contractStartDate) settings.contractStartDate = defaultContractStart();
    if (!meta || typeof meta !== 'object') meta = { receiptCounters: {} };
    if (!meta.receiptCounters || typeof meta.receiptCounters !== 'object') meta.receiptCounters = {};

    payments.sort(paymentSort);
    const byYear = new Map();
    for (const p of payments) {
      if (!byYear.has(p.year)) byYear.set(p.year, []);
      byYear.get(p.year).push(p);
    }
    for (const [year, list] of byYear.entries()) {
      let max = Number(meta.receiptCounters[year] || 0);
      for (const p of list) {
        const m = String(p.receiptNumber || '').match(/^(\d{4})-(\d{4})$/);
        if (m && Number(m[1]) === Number(year)) max = Math.max(max, Number(m[2]));
      }
      for (const p of list) {
        if (!p.receiptNumber) {
          max += 1;
          p.receiptNumber = `${year}-${String(max).padStart(4,'0')}`;
        }
      }
      meta.receiptCounters[year] = max;
    }
    saveAll();
  }

  function saveAll() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function showToast(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function configured() {
    return Boolean(settings.landlordName && settings.tenantName && settings.propertyAddress && Number(settings.monthlyRent) > 0 && settings.contractStartDate);
  }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function paymentSort(a,b) {
    return (a.year-b.year) || (a.month-b.month) || String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt));
  }

  function paymentApplied(p) {
    return Number(p.cashAmount || 0) + Number(p.depositAmount || 0);
  }

  function paymentsForMonth(year, month) {
    return payments.filter(p => Number(p.year) === Number(year) && Number(p.month) === Number(month)).sort(paymentSort);
  }

  function monthPaid(year, month) {
    return paymentsForMonth(year, month).reduce((sum,p) => sum + paymentApplied(p), 0);
  }

  function dueDate(year, month) {
    return new Date(Number(year), Number(month), Math.min(28, Math.max(1, Number(settings.dueDay || 1))));
  }

  function monthRelevant(year, month) {
    const start = parseISO(settings.contractStartDate);
    const end = parseISO(settings.contractEndDate);
    if (!start) return true;
    const key = Number(year) * 12 + Number(month);
    const startKey = start.getFullYear() * 12 + start.getMonth();
    if (key < startKey) return false;
    if (end) {
      const endKey = end.getFullYear() * 12 + end.getMonth();
      if (key > endKey) return false;
    }
    return true;
  }

  function finalSettlementDate(year, month) {
    const list = paymentsForMonth(year, month);
    let running = 0;
    for (const p of list) {
      running += paymentApplied(p);
      if (running + EPS >= Number(settings.monthlyRent || 0)) return parseISO(p.date);
    }
    return null;
  }

  function monthInfo(year, month, asOf = todayDate()) {
    const rent = Number(settings.monthlyRent || 0);
    const list = paymentsForMonth(year, month);
    const paid = list.reduce((s,p) => s + paymentApplied(p), 0);
    const outstanding = Math.max(0, rent - paid);
    const relevant = monthRelevant(year, month);
    const due = dueDate(year, month);
    const isDue = relevant && due <= asOf;
    const settled = rent > 0 && paid + EPS >= rent;
    const settledDate = settled ? finalSettlementDate(year, month) : null;
    const late = Boolean(settledDate && settledDate > due);
    const split = list.length > 1;
    let status = 'upcoming';
    if (!relevant) status = 'outside';
    else if (settled) status = late ? 'paid-late' : 'paid';
    else if (paid > EPS && isDue) status = 'partial-overdue';
    else if (paid > EPS) status = 'partial';
    else if (isDue) status = 'overdue';
    return { year, month, rent, list, paid, outstanding, relevant, due, isDue, settled, settledDate, late, split, status };
  }

  function allContractMonths(asOf = todayDate()) {
    const start = parseISO(settings.contractStartDate);
    if (!start) return [];
    const end = parseISO(settings.contractEndDate);
    const last = end && end < asOf ? end : asOf;
    const result = [];
    let y = start.getFullYear();
    let m = start.getMonth();
    const lastKey = last.getFullYear() * 12 + last.getMonth();
    while (y * 12 + m <= lastKey) {
      result.push(monthInfo(y,m,asOf));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      if (result.length > 1200) break;
    }
    return result;
  }

  function depositUsedTotal() {
    return payments.reduce((s,p) => s + Number(p.depositAmount || 0), 0);
  }

  function depositRemainingAmount() {
    return Math.max(0, Number(settings.depositAmount || 0) - depositUsedTotal());
  }

  function nextReceiptNumber(year) {
    const y = Number(year);
    const next = Number(meta.receiptCounters[y] || 0) + 1;
    meta.receiptCounters[y] = next;
    return `${y}-${String(next).padStart(4,'0')}`;
  }

  function receiptNo(p) {
    return p.receiptNumber || `${p.year}-${String(p.month + 1).padStart(2,'0')}`;
  }

  function availableYears() {
    const set = new Set([new Date().getFullYear(), currentYear]);
    const start = parseISO(settings.contractStartDate);
    const end = parseISO(settings.contractEndDate);
    if (start) {
      const lastYear = end ? end.getFullYear() : new Date().getFullYear();
      for (let y = start.getFullYear(); y <= Math.max(lastYear, new Date().getFullYear()); y++) set.add(y);
    }
    payments.forEach(p => set.add(Number(p.year)));
    return [...set].sort((a,b) => b-a);
  }

  function render() {
    renderHeader();
    renderDashboard();
    renderYearSelector();
    renderYearSummary();
    renderMonths();
  }

  function renderHeader() {
    $('homeTitle').textContent = configured() ? settings.propertyAddress.split('\n')[0] : 'Affitto';
    $('homeSubtitle').textContent = configured() ? `${settings.tenantName} · ${money(settings.monthlyRent)}/mese · scadenza giorno ${settings.dueDay}` : 'Configura immobile e contratto';
  }

  function renderDashboard() {
    $('todayLabel').textContent = fmtDate(todayDate());
    const months = configured() ? allContractMonths(todayDate()) : [];
    const open = months.filter(x => x.isDue && !x.settled);
    const late = months.filter(x => x.settled && x.late);
    const split = months.filter(x => x.split);
    const outstanding = open.reduce((s,x) => s + x.outstanding, 0);
    $('outstandingTotal').textContent = money(outstanding);
    $('openMonthsCount').textContent = String(open.length);
    $('lateMonthsCount').textContent = String(late.length);
    $('splitMonthsCount').textContent = String(split.length);
    $('depositRemaining').textContent = money(depositRemainingAmount());

    const badge = $('healthBadge');
    if (!configured()) {
      badge.textContent = 'Configura';
      badge.className = 'health-badge neutral';
    } else if (open.length === 0) {
      badge.textContent = 'In regola';
      badge.className = 'health-badge good';
    } else {
      badge.textContent = 'Da verificare';
      badge.className = 'health-badge warn';
    }

    const alerts = $('alertsList');
    alerts.innerHTML = '';
    if (!configured()) {
      alerts.appendChild(alertMessage('Inserisci i dati del contratto per attivare il riepilogo automatico.', 'neutral'));
      return;
    }
    if (!open.length && !late.length && !split.length) {
      alerts.appendChild(alertMessage('Nessuna mensilità scaduta o dilazionata registrata.', 'good'));
      return;
    }
    appendAlertGroup(alerts, 'Da saldare', open, x => `${MONTHS[x.month]} ${x.year}: mancano ${money(x.outstanding)} · scad. ${fmtShortDate(x.due)}`, 'warn');
    appendAlertGroup(alerts, 'Saldate in ritardo', late, x => `${MONTHS[x.month]} ${x.year}: saldo il ${fmtShortDate(x.settledDate)} · scad. ${fmtShortDate(x.due)}`, 'late');
    appendAlertGroup(alerts, 'Pagamenti dilazionati', split, x => `${MONTHS[x.month]} ${x.year}: ${x.list.length} versamenti`, 'split');
  }

  function alertMessage(text, cls) {
    const div = document.createElement('div');
    div.className = `alert-message ${cls}`;
    div.textContent = text;
    return div;
  }

  function appendAlertGroup(parent, title, items, formatter, cls) {
    if (!items.length) return;
    const group = document.createElement('div');
    group.className = `alert-group ${cls}`;
    const h = document.createElement('div');
    h.className = 'alert-title';
    h.textContent = title;
    group.appendChild(h);
    items.slice(-5).forEach(item => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'alert-row';
      row.textContent = formatter(item);
      row.addEventListener('click', () => openMonthDetail(item.month, item.year));
      group.appendChild(row);
    });
    if (items.length > 5) {
      const more = document.createElement('div');
      more.className = 'alert-more';
      more.textContent = `+ altre ${items.length - 5}`;
      group.appendChild(more);
    }
    parent.appendChild(group);
  }

  function renderYearSelector() {
    const select = $('yearSelect');
    const years = availableYears();
    if (!years.includes(currentYear)) years.push(currentYear);
    years.sort((a,b) => b-a);
    select.innerHTML = '';
    years.forEach(y => {
      const option = document.createElement('option');
      option.value = String(y);
      option.textContent = String(y);
      if (y === currentYear) option.selected = true;
      select.appendChild(option);
    });
  }

  function renderYearSummary() {
    const yearPayments = payments.filter(p => Number(p.year) === currentYear);
    $('yearCashTotal').textContent = money(yearPayments.reduce((s,p) => s + Number(p.cashAmount || 0), 0));
    $('yearDepositUsed').textContent = money(yearPayments.reduce((s,p) => s + Number(p.depositAmount || 0), 0));
    const relevantMonths = MONTHS.map((_,m) => monthInfo(currentYear,m)).filter(x => x.relevant);
    const settled = relevantMonths.filter(x => x.settled).length;
    $('paidCount').textContent = `${settled}/${relevantMonths.length || 0}`;
  }

  function renderMonths() {
    const list = $('monthsList');
    list.innerHTML = '';
    MONTHS.forEach((name, month) => {
      const info = monthInfo(currentYear, month);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `month-card status-${info.status}`;
      if (!info.relevant) btn.classList.add('outside-contract');

      const main = document.createElement('div');
      main.className = 'month-main';
      const dot = document.createElement('span');
      dot.className = 'status-dot';
      const text = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'month-name';
      title.textContent = name;
      const sub = document.createElement('div');
      sub.className = 'month-sub';
      sub.textContent = monthSubtitle(info);
      text.append(title, sub);
      main.append(dot, text);

      const side = document.createElement('div');
      side.className = 'month-side';
      const amount = document.createElement('div');
      amount.className = 'month-amount';
      if (!info.relevant) amount.textContent = '—';
      else if (info.settled) amount.textContent = money(info.paid);
      else if (info.paid > EPS) amount.textContent = `${money(info.paid)} / ${money(info.rent)}`;
      else amount.textContent = money(info.rent);
      side.appendChild(amount);
      if (info.list.length > 1) {
        const splitTag = document.createElement('span');
        splitTag.className = 'mini-tag split';
        splitTag.textContent = `${info.list.length} versamenti`;
        side.appendChild(splitTag);
      } else if (info.late) {
        const lateTag = document.createElement('span');
        lateTag.className = 'mini-tag late';
        lateTag.textContent = 'in ritardo';
        side.appendChild(lateTag);
      }

      btn.append(main, side);
      btn.addEventListener('click', () => info.relevant ? openMonthDetail(month, currentYear) : null);
      list.appendChild(btn);
    });
  }

  function monthSubtitle(info) {
    switch (info.status) {
      case 'outside': return 'Fuori dal periodo contrattuale';
      case 'paid': return `Saldata${info.list.length > 1 ? ` in ${info.list.length} versamenti` : ` il ${fmtShortDate(info.settledDate)}`}`;
      case 'paid-late': return `Saldata in ritardo il ${fmtShortDate(info.settledDate)}`;
      case 'partial-overdue': return `Parziale · mancano ${money(info.outstanding)} · scaduta`;
      case 'partial': return `Acconto ricevuto · mancano ${money(info.outstanding)}`;
      case 'overdue': return `Da pagare · scaduta il ${fmtShortDate(info.due)}`;
      default: return `Non ancora dovuta · scadenza ${fmtShortDate(info.due)}`;
    }
  }

  // Settings
  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettingsBtn').addEventListener('click', () => $('settingsDialog').close());

  function openSettings() {
    $('landlordName').value = settings.landlordName || '';
    $('tenantName').value = settings.tenantName || '';
    $('propertyAddress').value = settings.propertyAddress || '';
    $('monthlyRent').value = settings.monthlyRent || '';
    $('dueDay').value = settings.dueDay || 1;
    $('contractStartDate').value = settings.contractStartDate || defaultContractStart();
    $('contractEndDate').value = settings.contractEndDate || '';
    $('depositAmount').value = settings.depositAmount || '';
    $('depositDate').value = settings.depositDate || '';
    $('receiptPlace').value = settings.receiptPlace || '';
    $('settingsDialog').showModal();
  }

  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const depositAmount = Number($('depositAmount').value || 0);
    const alreadyUsed = depositUsedTotal();
    if (depositAmount + EPS < alreadyUsed) {
      alert(`La cauzione iniziale non può essere inferiore a ${money(alreadyUsed)}, già imputati ai canoni.`);
      return;
    }
    settings = {
      landlordName: $('landlordName').value.trim(),
      tenantName: $('tenantName').value.trim(),
      propertyAddress: $('propertyAddress').value.trim(),
      monthlyRent: Number($('monthlyRent').value),
      dueDay: Math.min(28, Math.max(1, Number($('dueDay').value || 1))),
      contractStartDate: $('contractStartDate').value,
      contractEndDate: $('contractEndDate').value,
      depositAmount,
      depositDate: $('depositDate').value,
      receiptPlace: $('receiptPlace').value.trim()
    };
    if (settings.contractEndDate && parseISO(settings.contractEndDate) < parseISO(settings.contractStartDate)) {
      alert('La data di fine contratto non può precedere la data di inizio.');
      return;
    }
    saveAll();
    $('settingsDialog').close();
    render();
    showToast('Impostazioni salvate');
  });

  // Year navigation
  $('prevYear').addEventListener('click', () => { currentYear -= 1; render(); });
  $('nextYear').addEventListener('click', () => { currentYear += 1; render(); });
  $('yearSelect').addEventListener('change', (e) => { currentYear = Number(e.target.value); render(); });

  // Signature pads
  const pads = new Map();
  setupSignaturePad($('tenantSignature'));
  setupSignaturePad($('landlordSignature'));

  function setupSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    const state = { drawing: false, hasInk: false, lastX: 0, lastY: 0 };
    pads.set(canvas.id, state);
    const point = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * canvas.width / r.width, y: (ev.clientY - r.top) * canvas.height / r.height };
    };
    canvas.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      const p = point(ev);
      state.drawing = true; state.lastX = p.x; state.lastY = p.y;
    });
    canvas.addEventListener('pointermove', ev => {
      if (!state.drawing) return;
      ev.preventDefault();
      const p = point(ev);
      ctx.beginPath(); ctx.moveTo(state.lastX, state.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      state.lastX = p.x; state.lastY = p.y; state.hasInk = true;
    });
    const stop = ev => { if (state.drawing) { ev.preventDefault(); state.drawing = false; } };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  function clearPad(id) {
    const canvas = $(id);
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    const s = pads.get(id); s.hasInk = false; s.drawing = false;
  }

  document.querySelectorAll('[data-clear]').forEach(btn => btn.addEventListener('click', () => clearPad(btn.dataset.clear)));

  function signatureJPEG(canvas) {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,tmp.width,tmp.height); ctx.drawImage(canvas,0,0);
    return tmp.toDataURL('image/jpeg', 0.78);
  }

  // Payment form
  MONTHS.forEach((m, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = m; $('paymentMonth').appendChild(o);
  });

  $('newPaymentBtn').addEventListener('click', () => {
    const now = new Date();
    const candidateYear = currentYear;
    const candidateMonth = candidateYear === now.getFullYear() ? now.getMonth() : 0;
    openPayment(candidateMonth, candidateYear);
  });
  $('closePaymentBtn').addEventListener('click', () => $('paymentDialog').close());
  $('paymentMonth').addEventListener('change', refreshPaymentBalance);
  $('paymentYear').addEventListener('input', refreshPaymentBalance);
  $('useDeposit').addEventListener('change', () => {
    $('depositUseWrap').classList.toggle('hidden', !$('useDeposit').checked);
    if (!$('useDeposit').checked) $('paymentDepositAmount').value = '0';
  });

  function refreshPaymentBalance() {
    const month = Number($('paymentMonth').value);
    const year = Number($('paymentYear').value);
    if (!Number.isFinite(month) || !Number.isFinite(year)) return;
    const info = monthInfo(year, month);
    const box = $('monthBalanceBox');
    box.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = `${MONTHS[month]} ${year}`;
    const detail = document.createElement('span');
    detail.textContent = info.settled ? `Mensilità già saldata (${money(info.paid)})` : `Canone ${money(info.rent)} · già imputato ${money(info.paid)} · residuo ${money(info.outstanding)}`;
    box.append(title, detail);
    const remaining = Math.max(0, info.outstanding);
    $('paymentCashAmount').value = remaining > 0 ? remaining.toFixed(2) : '0.00';
    $('depositAvailableHint').textContent = `Cauzione disponibile: ${money(depositRemainingAmount())}`;
  }

  function openPayment(month, year) {
    if (!configured()) { openSettings(); showToast('Inserisci prima i dati dell’affitto'); return; }
    const info = monthInfo(year, month);
    if (!info.relevant) { showToast('Questa mensilità è fuori dal periodo contrattuale'); return; }
    if (info.settled) { openMonthDetail(month, year); showToast('Mensilità già saldata'); return; }
    $('paymentDialogTitle').textContent = info.list.length ? 'Aggiungi un versamento' : 'Registra pagamento';
    $('paymentMonth').value = String(month);
    $('paymentYear').value = year;
    $('paymentDate').value = todayISO();
    $('paymentNotes').value = '';
    $('confirmCash').checked = false;
    $('useDeposit').checked = false;
    $('depositUseWrap').classList.add('hidden');
    $('paymentDepositAmount').value = '0';
    clearPad('tenantSignature');
    clearPad('landlordSignature');
    refreshPaymentBalance();
    $('paymentDialog').showModal();
  }

  $('paymentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const month = Number($('paymentMonth').value);
    const year = Number($('paymentYear').value);
    const cashAmount = Number($('paymentCashAmount').value || 0);
    const depositAmount = $('useDeposit').checked ? Number($('paymentDepositAmount').value || 0) : 0;
    const total = cashAmount + depositAmount;
    const info = monthInfo(year, month);

    if (!info.relevant) { alert('La mensilità selezionata è fuori dal periodo contrattuale.'); return; }
    if (info.settled) { alert('Questa mensilità risulta già saldata.'); return; }
    if (!(total > EPS)) { alert('Inserisci un importo maggiore di zero.'); return; }
    if (total > info.outstanding + EPS) { alert(`Il versamento supera il residuo della mensilità (${money(info.outstanding)}).`); return; }
    if (depositAmount > depositRemainingAmount() + EPS) { alert(`La quota di cauzione supera il residuo disponibile (${money(depositRemainingAmount())}).`); return; }
    if (!pads.get('tenantSignature').hasInk || !pads.get('landlordSignature').hasInk) {
      alert('Sono necessarie entrambe le firme prima di registrare il versamento.');
      return;
    }

    const p = {
      id: uuid(), month, year,
      cashAmount,
      depositAmount,
      date: $('paymentDate').value,
      notes: $('paymentNotes').value.trim(),
      tenantSignature: signatureJPEG($('tenantSignature')),
      landlordSignature: signatureJPEG($('landlordSignature')),
      createdAt: new Date().toISOString(),
      receiptNumber: nextReceiptNumber(year)
    };
    payments.push(p);
    payments.sort(paymentSort);
    saveAll();
    currentYear = year;
    $('paymentDialog').close();
    render();
    openReceipt(p.id, true);
  });

  // Month details
  $('closeMonthBtn').addEventListener('click', () => $('monthDialog').close());
  $('addInstallmentBtn').addEventListener('click', () => {
    if (!activeMonth) return;
    $('monthDialog').close();
    openPayment(activeMonth.month, activeMonth.year);
  });

  function openMonthDetail(month, year) {
    const info = monthInfo(year, month);
    activeMonth = { month, year };
    $('monthDialogTitle').textContent = `${MONTHS[month]} ${year}`;
    const summary = $('monthDetailSummary');
    summary.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'month-detail-top';
    top.innerHTML = `<span>Canone</span><strong>${money(info.rent)}</strong><span>Imputato</span><strong>${money(info.paid)}</strong><span>Residuo</span><strong>${money(info.outstanding)}</strong>`;
    summary.appendChild(top);
    const status = document.createElement('div');
    status.className = `month-status-line status-${info.status}`;
    status.textContent = monthSubtitle(info);
    summary.appendChild(status);

    const list = $('monthTransactions');
    list.innerHTML = '';
    if (!info.list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nessun versamento registrato per questa mensilità.';
      list.appendChild(empty);
    } else {
      info.list.forEach((p, idx) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'transaction-row';
        const left = document.createElement('div');
        left.innerHTML = `<strong>Versamento ${idx + 1}</strong><span>${fmtDate(p.date)} · ricevuta ${receiptNo(p)}</span>`;
        const right = document.createElement('div');
        right.className = 'transaction-amount';
        right.innerHTML = `<strong>${money(paymentApplied(p))}</strong>${p.depositAmount > EPS ? `<span>di cui ${money(p.depositAmount)} da cauzione</span>` : '<span>contanti</span>'}`;
        row.append(left,right);
        row.addEventListener('click', () => { $('monthDialog').close(); openReceipt(p.id); });
        list.appendChild(row);
      });
    }
    $('addInstallmentBtn').classList.toggle('hidden', info.settled || !info.relevant);
    $('monthDialog').showModal();
  }

  // Receipt dialog
  function openReceipt(id, justCreated = false) {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    activePaymentId = id;
    $('receiptDialogTitle').textContent = justCreated ? 'Versamento registrato' : `Ricevuta ${receiptNo(p)}`;
    const info = monthInfo(p.year, p.month);
    const list = paymentsForMonth(p.year,p.month);
    const installmentNo = list.findIndex(x => x.id === p.id) + 1;
    const box = $('receiptSummary');
    box.innerHTML = '';
    const dl = document.createElement('dl');
    const rows = [
      ['Mensilità', `${MONTHS[p.month]} ${p.year}`],
      ['Versamento', `${installmentNo}${list.length > 1 ? ` di ${list.length}` : ''}`],
      ['Contanti', money(p.cashAmount)],
      ['Da cauzione', money(p.depositAmount)],
      ['Totale imputato', money(paymentApplied(p))],
      ['Data', fmtDate(p.date)],
      ['Ricevuta', receiptNo(p)],
      ['Residuo mensilità', money(info.outstanding)]
    ];
    rows.forEach(([k,v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt,dd);
    });
    box.appendChild(dl);
    $('receiptDialog').showModal();
  }

  $('closeReceiptBtn').addEventListener('click', () => $('receiptDialog').close());
  $('shareReceiptBtn').addEventListener('click', async () => {
    const p = payments.find(x => x.id === activePaymentId); if (!p) return;
    const blob = buildReceiptPDF(p);
    const filename = receiptFilename(p);
    const file = new File([blob], filename, { type: 'application/pdf' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `Ricevuta affitto ${MONTHS[p.month]} ${p.year}` });
      } else {
        downloadBlob(blob, filename);
        showToast('PDF scaricato: salvalo poi in OneDrive/Dropbox');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      downloadBlob(blob, filename);
      showToast('Condivisione non disponibile: PDF scaricato');
    }
  });

  $('downloadReceiptBtn').addEventListener('click', () => {
    const p = payments.find(x => x.id === activePaymentId); if (!p) return;
    downloadBlob(buildReceiptPDF(p), receiptFilename(p));
  });

  $('deletePaymentBtn').addEventListener('click', () => {
    const p = payments.find(x => x.id === activePaymentId); if (!p) return;
    if (!confirm(`Eliminare il versamento del ${fmtDate(p.date)} per ${MONTHS[p.month]} ${p.year}? Il numero ricevuta ${receiptNo(p)} non verrà riutilizzato.`)) return;
    payments = payments.filter(x => x.id !== p.id);
    saveAll();
    $('receiptDialog').close();
    render();
    showToast('Versamento eliminato');
  });

  function receiptFilename(p) {
    const safeTenant = (settings.tenantName || 'inquilino').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g,'');
    return `${p.year}-${String(p.month+1).padStart(2,'0')}_${receiptNo(p)}_Ricevuta_Affitto_${safeTenant}.pdf`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Backup / restore
  $('exportBtn').addEventListener('click', () => {
    const backup = { app: 'Registro Affitto', version: 2, exportedAt: new Date().toISOString(), settings, payments, meta };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `backup_affitto_${todayISO()}.json`);
  });

  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !data.settings || !Array.isArray(data.payments)) throw new Error('Formato non valido');
      if (!confirm('Importare questo backup? I dati attuali verranno sostituiti.')) return;
      settings = data.settings;
      payments = data.payments;
      meta = data.meta || { receiptCounters: {} };
      normalizeData();
      render();
      showToast('Backup importato');
    } catch (_) { alert('Il file selezionato non è un backup valido di Registro Affitto.'); }
    finally { e.target.value = ''; }
  });

  // PDF generator: A4, self-contained, no external libraries.
  function buildReceiptPDF(p) {
    const tenantImg = dataURLBytes(p.tenantSignature);
    const landlordImg = dataURLBytes(p.landlordSignature);
    const content = receiptContentStream(p);
    const objects = [];
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = ascii('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
    objects[3] = ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /SigT 6 0 R /SigL 7 0 R >> >> /Contents 8 0 R >>');
    objects[4] = ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects[5] = ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    objects[6] = streamObject(tenantImg, `<< /Type /XObject /Subtype /Image /Width 900 /Height 270 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${tenantImg.length} >>`);
    objects[7] = streamObject(landlordImg, `<< /Type /XObject /Subtype /Image /Width 900 /Height 270 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${landlordImg.length} >>`);
    const contentBytes = ascii(content);
    objects[8] = streamObject(contentBytes, `<< /Length ${contentBytes.length} >>`);

    const chunks = [];
    let length = 0;
    const offsets = [0];
    const push = bytes => { chunks.push(bytes); length += bytes.length; };
    push(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));
    for (let i=1; i<=8; i++) {
      offsets[i] = length;
      push(ascii(`${i} 0 obj\n`)); push(objects[i]); push(ascii('\nendobj\n'));
    }
    const xrefOffset = length;
    push(ascii('xref\n0 9\n'));
    push(ascii('0000000000 65535 f \n'));
    for (let i=1; i<=8; i++) push(ascii(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`));
    push(ascii(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function receiptProgressAtTransaction(p) {
    const list = paymentsForMonth(p.year,p.month);
    let running = 0;
    let index = 0;
    for (let i=0; i<list.length; i++) {
      running += paymentApplied(list[i]);
      if (list[i].id === p.id) { index = i + 1; break; }
    }
    return { running, index, totalTransactions: list.length, residual: Math.max(0, Number(settings.monthlyRent) - running) };
  }

  function receiptContentStream(p) {
    const out = [];
    const navy = [0.09,0.16,0.29];
    const muted = [0.40,0.45,0.55];
    const light = [0.95,0.97,0.99];
    const text = (x,y,size,value,bold=false,color=null) => {
      if (color) out.push(`${color[0]} ${color[1]} ${color[2]} rg`);
      else out.push('0.09 0.13 0.20 rg');
      out.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${pdfHex(value)} Tj ET`);
    };
    const line = (x1,y1,x2,y2,w=.7,color=[0.82,0.85,0.90]) => out.push(`${color[0]} ${color[1]} ${color[2]} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
    const fillRect = (x,y,w,h,color) => out.push(`${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${w} ${h} re f`);
    const strokeRect = (x,y,w,h,color=[0.82,0.85,0.90],width=.7) => out.push(`${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x} ${y} ${w} ${h} re S`);

    const progress = receiptProgressAtTransaction(p);
    const totalApplied = paymentApplied(p);
    const hasDeposit = Number(p.depositAmount || 0) > EPS;

    // Header
    fillRect(0, 748, 595.28, 93.89, navy);
    text(46, 799, 10, 'REGISTRO AFFITTO', true, [1,1,1]);
    text(46, 773, 21, 'RICEVUTA DI PAGAMENTO', true, [1,1,1]);
    text(426, 799, 9, 'RICEVUTA N.', false, [0.78,0.83,0.91]);
    text(426, 780, 13, receiptNo(p), true, [1,1,1]);

    text(46, 716, 9, 'IMMOBILE', true, muted);
    let y = 698;
    for (const l of wrapText(settings.propertyAddress.replace(/\n+/g, ', '), 78)) { text(46, y, 10.5, l); y -= 15; }
    text(390, 716, 9, 'DATA', true, muted);
    text(390, 698, 10.5, fmtDate(p.date));
    line(46, 670, 549, 670);

    // Parties
    text(46, 643, 9, 'LOCATORE', true, muted);
    text(46, 625, 11, settings.landlordName, true);
    text(310, 643, 9, 'CONDUTTORE', true, muted);
    text(310, 625, 11, settings.tenantName, true);

    // Summary box
    fillRect(46, 510, 503, 86, light);
    strokeRect(46, 510, 503, 86);
    text(62, 576, 9, 'MENSILITÀ', true, muted);
    text(62, 557, 12, `${MONTHS[p.month]} ${p.year}`, true);
    text(220, 576, 9, 'CANONE', true, muted);
    text(220, 557, 12, money(settings.monthlyRent), true);
    text(340, 576, 9, 'QUESTO VERSAMENTO', true, muted);
    text(340, 557, 12, money(totalApplied), true);
    text(462, 576, 9, 'RESIDUO', true, muted);
    text(462, 557, 12, money(progress.residual), true);
    text(62, 530, 9, `Versamento ${progress.index}${progress.totalTransactions > 1 ? ` di ${progress.totalTransactions}` : ''} · scadenza mensilità ${fmtShortDate(dueDate(p.year,p.month))}`, false, muted);

    // Body
    let bodyY = 476;
    const body1 = `Il sottoscritto ${settings.landlordName}, in qualità di locatore, dichiara di aver ricevuto da ${settings.tenantName} il presente versamento, imputato al canone di locazione relativo a ${MONTHS[p.month]} ${p.year}.`;
    for (const l of wrapText(body1, 89)) { text(46, bodyY, 10.5, l); bodyY -= 16; }
    bodyY -= 5;
    const composition = hasDeposit
      ? `Composizione del versamento: ${money(p.cashAmount)} in contanti e ${money(p.depositAmount)} mediante imputazione della cauzione/caparra, per un totale di ${money(totalApplied)}.`
      : `Importo ricevuto in contanti: ${money(p.cashAmount)}.`;
    for (const l of wrapText(composition, 89)) { text(46, bodyY, 10.5, l); bodyY -= 16; }
    bodyY -= 5;
    const statusText = progress.residual > EPS
      ? `Il presente versamento costituisce un acconto. Dopo questo pagamento restano ${money(progress.residual)} da corrispondere per la mensilità indicata.`
      : 'Con il presente versamento la mensilità indicata risulta integralmente saldata.';
    for (const l of wrapText(statusText, 89)) { text(46, bodyY, 10.5, l); bodyY -= 16; }

    if (p.notes) {
      bodyY -= 7;
      text(46, bodyY, 9, 'NOTE', true, muted); bodyY -= 16;
      for (const l of wrapText(p.notes, 92).slice(0,4)) { text(46, bodyY, 9.5, l); bodyY -= 15; }
    }

    // Signatures
    const sigY = 164;
    line(46, 292, 549, 292);
    text(46, 270, 9, 'FIRME', true, muted);
    text(66, 246, 9.5, 'Firma del conduttore', true);
    text(322, 246, 9.5, 'Firma del locatore', true);
    out.push(`q 210 0 0 63 46 ${sigY} cm /SigT Do Q`);
    out.push(`q 210 0 0 63 302 ${sigY} cm /SigL Do Q`);
    line(46, 154, 256, 154, .55);
    line(302, 154, 512, 154, .55);
    text(66, 137, 8.5, settings.tenantName, false, muted);
    text(322, 137, 8.5, settings.landlordName, false, muted);

    // Footer
    line(46, 103, 549, 103);
    text(46, 84, 8.2, `${settings.receiptPlace ? settings.receiptPlace + ' · ' : ''}Documento generato il ${fmtDate(todayDate())}`, false, muted);
    text(46, 68, 8.2, `Ricevuta ${receiptNo(p)} · Pagamento riferito a ${MONTHS[p.month]} ${p.year}`, false, muted);
    return out.join('\n') + '\n';
  }

  function wrapText(s, maxChars) {
    const words = String(s).replace(/\s+/g,' ').trim().split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }

  function ascii(s) { return new TextEncoder().encode(s); }
  function streamObject(data, dict) {
    const a = ascii(dict + '\nstream\n');
    const b = ascii('\nendstream');
    const out = new Uint8Array(a.length + data.length + b.length);
    out.set(a,0); out.set(data,a.length); out.set(b,a.length+data.length);
    return out;
  }
  function dataURLBytes(dataURL) {
    const base64 = String(dataURL).split(',')[1] || '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function pdfHex(s) {
    const bytes = cp1252(String(s));
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2,'0');
    return `<${hex}>`;
  }
  function cp1252(s) {
    const special = new Map([
      [0x20AC,0x80],[0x201A,0x82],[0x0192,0x83],[0x201E,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],
      [0x02C6,0x88],[0x2030,0x89],[0x0160,0x8A],[0x2039,0x8B],[0x0152,0x8C],[0x017D,0x8E],[0x2018,0x91],
      [0x2019,0x92],[0x201C,0x93],[0x201D,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x02DC,0x98],
      [0x2122,0x99],[0x0161,0x9A],[0x203A,0x9B],[0x0153,0x9C],[0x017E,0x9E],[0x0178,0x9F]
    ]);
    const arr = [];
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (code <= 255) arr.push(code);
      else if (special.has(code)) arr.push(special.get(code));
      else arr.push(0x3F);
    }
    return new Uint8Array(arr);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  render();
  if (!configured()) setTimeout(openSettings, 250);
})();
