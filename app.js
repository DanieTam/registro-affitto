(() => {
  'use strict';

  const SETTINGS_KEY = 'affitto.settings.v1';
  const PAYMENTS_KEY = 'affitto.payments.v1';
  const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  const $ = (id) => document.getElementById(id);
  const todayISO = () => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y,m,d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'long', year:'numeric' }).format(new Date(y, m-1, d));
  };

  let settings = loadJSON(SETTINGS_KEY, {
    landlordName: '', tenantName: '', propertyAddress: '', monthlyRent: '', receiptPlace: ''
  });
  let payments = loadJSON(PAYMENTS_KEY, []);
  let currentYear = new Date().getFullYear();
  let activePaymentId = null;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }
  function saveAll() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
  }
  function showToast(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function configured() {
    return settings.landlordName && settings.tenantName && settings.propertyAddress && settings.monthlyRent !== '';
  }
  function receiptNo(p) {
    return `${p.year}/${String(p.month + 1).padStart(2, '0')}`;
  }
  function paymentFor(year, month) {
    return payments.find(p => Number(p.year) === Number(year) && Number(p.month) === Number(month));
  }
  function uuid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function render() {
    $('yearLabel').textContent = currentYear;
    $('homeTitle').textContent = configured() ? settings.propertyAddress.split('\n')[0] : 'Affitto';
    $('homeSubtitle').textContent = configured() ? `${settings.tenantName} · ${money(settings.monthlyRent)}/mese` : 'Configura immobile e contratto';

    const yearPayments = payments.filter(p => Number(p.year) === currentYear);
    $('yearTotal').textContent = money(yearPayments.reduce((s,p) => s + Number(p.amount || 0), 0));
    $('paidCount').textContent = `${yearPayments.length}/12`;

    const list = $('monthsList');
    list.innerHTML = '';
    MONTHS.forEach((name, month) => {
      const p = paymentFor(currentYear, month);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `month-card ${p ? 'paid' : 'unpaid'}`;
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
      sub.textContent = p ? `Pagato il ${fmtDate(p.date)}` : 'Non registrato';
      text.append(title, sub);
      main.append(dot, text);
      const amount = document.createElement('div');
      amount.className = 'month-amount';
      amount.textContent = p ? money(p.amount) : money(settings.monthlyRent || 0);
      btn.append(main, amount);
      btn.addEventListener('click', () => p ? openReceipt(p.id) : openPayment(month, currentYear));
      list.appendChild(btn);
    });
  }

  // Settings
  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettingsBtn').addEventListener('click', () => $('settingsDialog').close());
  function openSettings() {
    $('landlordName').value = settings.landlordName || '';
    $('tenantName').value = settings.tenantName || '';
    $('propertyAddress').value = settings.propertyAddress || '';
    $('monthlyRent').value = settings.monthlyRent || '';
    $('receiptPlace').value = settings.receiptPlace || '';
    $('settingsDialog').showModal();
  }
  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    settings = {
      landlordName: $('landlordName').value.trim(),
      tenantName: $('tenantName').value.trim(),
      propertyAddress: $('propertyAddress').value.trim(),
      monthlyRent: Number($('monthlyRent').value),
      receiptPlace: $('receiptPlace').value.trim()
    };
    saveAll();
    $('settingsDialog').close();
    render();
    showToast('Impostazioni salvate');
  });

  // Year navigation
  $('prevYear').addEventListener('click', () => { currentYear--; render(); });
  $('nextYear').addEventListener('click', () => { currentYear++; render(); });

  // Payment form
  MONTHS.forEach((m, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = m; $('paymentMonth').appendChild(o);
  });
  $('newPaymentBtn').addEventListener('click', () => openPayment(new Date().getMonth(), currentYear));
  $('closePaymentBtn').addEventListener('click', () => $('paymentDialog').close());

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
      return {
        x: (ev.clientX - r.left) * canvas.width / r.width,
        y: (ev.clientY - r.top) * canvas.height / r.height
      };
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
      ctx.beginPath();
      ctx.moveTo(state.lastX, state.lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      state.lastX = p.x; state.lastY = p.y; state.hasInk = true;
    });
    const stop = ev => {
      if (state.drawing) { ev.preventDefault(); state.drawing = false; }
    };
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
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,tmp.width,tmp.height);
    ctx.drawImage(canvas,0,0);
    return tmp.toDataURL('image/jpeg', 0.72);
  }

  function openPayment(month, year) {
    if (!configured()) { openSettings(); showToast('Inserisci prima i dati dell’affitto'); return; }
    $('paymentMonth').value = String(month);
    $('paymentYear').value = year;
    $('paymentAmount').value = Number(settings.monthlyRent).toFixed(2);
    $('paymentDate').value = todayISO();
    $('paymentNotes').value = '';
    $('confirmCash').checked = false;
    clearPad('tenantSignature');
    clearPad('landlordSignature');
    $('paymentDialog').showModal();
  }

  $('paymentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const month = Number($('paymentMonth').value);
    const year = Number($('paymentYear').value);
    if (paymentFor(year, month)) {
      alert(`Esiste già un pagamento registrato per ${MONTHS[month]} ${year}.`);
      return;
    }
    if (!pads.get('tenantSignature').hasInk || !pads.get('landlordSignature').hasInk) {
      alert('Sono necessarie entrambe le firme prima di registrare il pagamento.');
      return;
    }
    const p = {
      id: uuid(), month, year,
      amount: Number($('paymentAmount').value),
      date: $('paymentDate').value,
      method: $('paymentMethod').value,
      notes: $('paymentNotes').value.trim(),
      tenantSignature: signatureJPEG($('tenantSignature')),
      landlordSignature: signatureJPEG($('landlordSignature')),
      createdAt: new Date().toISOString()
    };
    payments.push(p);
    payments.sort((a,b) => (a.year-b.year) || (a.month-b.month));
    saveAll();
    currentYear = year;
    $('paymentDialog').close();
    render();
    openReceipt(p.id, true);
  });

  // Receipt dialog
  function openReceipt(id, justCreated = false) {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    activePaymentId = id;
    $('receiptDialogTitle').textContent = justCreated ? 'Pagamento registrato' : `Ricevuta ${receiptNo(p)}`;
    const box = $('receiptSummary');
    box.innerHTML = '';
    const dl = document.createElement('dl');
    const rows = [
      ['Mensilità', `${MONTHS[p.month]} ${p.year}`],
      ['Importo', money(p.amount)],
      ['Data', fmtDate(p.date)],
      ['Metodo', p.method],
      ['Ricevuta', receiptNo(p)]
    ];
    rows.forEach(([k,v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt,dd);
    });
    box.appendChild(dl);
    $('deletePaymentBtn').classList.toggle('hidden', justCreated);
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
    if (!confirm(`Eliminare il pagamento di ${MONTHS[p.month]} ${p.year}?`)) return;
    payments = payments.filter(x => x.id !== p.id);
    saveAll();
    $('receiptDialog').close();
    render();
    showToast('Pagamento eliminato');
  });

  function receiptFilename(p) {
    const safeTenant = (settings.tenantName || 'inquilino').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g,'');
    return `${p.year}-${String(p.month+1).padStart(2,'0')}_Ricevuta_Affitto_${safeTenant}.pdf`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Backup / restore
  $('exportBtn').addEventListener('click', () => {
    const backup = { app: 'Registro Affitto', version: 1, exportedAt: new Date().toISOString(), settings, payments };
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
      settings = data.settings; payments = data.payments; saveAll(); render(); showToast('Backup importato');
    } catch (_) { alert('Il file selezionato non è un backup valido di Registro Affitto.'); }
    finally { e.target.value = ''; }
  });

  // Minimal self-contained PDF generator with embedded signature JPEGs.
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
      push(ascii(`${i} 0 obj\n`));
      push(objects[i]);
      push(ascii('\nendobj\n'));
    }
    const xrefOffset = length;
    push(ascii('xref\n0 9\n'));
    push(ascii('0000000000 65535 f \n'));
    for (let i=1; i<=8; i++) push(ascii(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`));
    push(ascii(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function receiptContentStream(p) {
    const out = [];
    const text = (x,y,size,value,bold=false) => {
      out.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${pdfHex(value)} Tj ET`);
    };
    const line = (x1,y1,x2,y2,w=.7) => out.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);

    text(56, 774, 18, 'RICEVUTA DI PAGAMENTO CANONE DI LOCAZIONE', true);
    text(56, 747, 11, `Ricevuta n. ${receiptNo(p)}`, true);
    text(390, 747, 10, `${settings.receiptPlace ? settings.receiptPlace + ', ' : ''}${fmtDate(p.date)}`);
    line(56, 730, 539, 730, .8);

    const body = `Il sottoscritto ${settings.landlordName}, in qualita di locatore, dichiara di aver ricevuto da ${settings.tenantName} la somma di ${money(p.amount)}, corrisposta in ${String(p.method).toLowerCase()} quale pagamento del canone di locazione relativo al mese di ${MONTHS[p.month]} ${p.year}, per l'immobile sito in ${settings.propertyAddress.replace(/\n+/g, ', ')}.`;
    const lines = wrapText(body, 84);
    let y = 688;
    for (const l of lines) { text(56, y, 11, l); y -= 18; }

    if (p.notes) {
      y -= 12;
      text(56, y, 10, 'Note:', true); y -= 16;
      for (const l of wrapText(p.notes, 92)) { text(56, y, 10, l); y -= 16; }
    }

    y = Math.min(y - 28, 500);
    text(56, y, 10, 'Il presente documento attesta la consegna e la ricezione del pagamento sopra indicato.');

    text(70, 285, 10, 'Firma del conduttore', true);
    text(322, 285, 10, 'Firma del locatore', true);
    out.push('q 210 0 0 63 55 205 cm /SigT Do Q');
    out.push('q 210 0 0 63 305 205 cm /SigL Do Q');
    line(55, 195, 265, 195, .5);
    line(305, 195, 515, 195, .5);
    text(70, 177, 9, settings.tenantName);
    text(322, 177, 9, settings.landlordName);

    text(56, 112, 8.5, `Pagamento: ${p.method} · Mensilita: ${MONTHS[p.month]} ${p.year} · Importo: ${money(p.amount)}`);
    text(56, 94, 8, 'Documento generato dal registro personale dei pagamenti del locatore.');
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
