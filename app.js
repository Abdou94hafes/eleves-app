/* ================== Config ================== */
const API_BASE = 'https://script.google.com/macros/s/AKfycbz98bVRrHP7WyYEXhywcYAxaZ8lXnQSYIWjbOOmLzzqP9LZUpw4RJfxr2yhWnNojKYNbQ/exec';
const MAX_SCORE = 20;

/* ================== State & utils ================== */
let students = [];
let activeIdx = null;
let chartInstance = null;
const skillsLabels = ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"];

const qs = (id)=> document.getElementById(id);
const setLoading = (el,on)=>{ if(!el) return; el.classList.toggle('loading',!!on); el.disabled=!!on; };
const clamp = v => Math.max(0, Math.min(MAX_SCORE, Number(v)||0));
function toast(msg){ const t=qs('toast'); if(!t) return; t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none', 2600); }

/* debounce للبحث */
function debounce(fn, wait=160){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
const renderListDebounced = debounce(renderList, 160);

/* ================== API via GET ================== */
async function getJSON(params){
  const url = API_BASE + '?' + new URLSearchParams(params).toString();
  let res;
  try { res = await fetch(url, { method: 'GET', cache: 'no-store' }); }
  catch (e) { alert('Erreur réseau.'); throw e; }
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('HTTP '+res.status+' '+txt.slice(0,120));
  }
  const ct = res.headers.get('content-type')||'';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    console.error('Non-JSON response:', text.slice(0,200));
    throw new Error("Réponse non JSON (vérifiez les permissions Web App).");
  }
  return res.json();
}
const backend = {
  getAll(){           return getJSON({ action:'get' }); },
  create(s){          return getJSON({ action:'create', ...s }); },
  update(index, s){   return getJSON({ action:'update', index, ...s }); },
  remove(index){      return getJSON({ action:'delete', index }); }
};

/* ================== Form ================== */
function readFormValues(){
  return {
    nom: qs('nom').value.trim(),
    prenom: qs('prenom').value.trim(),
    sexe: qs('sexe').value,
    classe: qs('classe').value.trim(),
    notes: qs('notes').value.trim(),
    ecriture: clamp(qs('ecriture').value),
    lecture: clamp(qs('lecture').value),
    vocabulaire: clamp(qs('vocabulaire').value),
    grammaire: clamp(qs('grammaire').value),
    conjugaison: clamp(qs('conjugaison').value),
    orthographe: clamp(qs('orthographe').value),
    // حقول comportement اختيارية — تحفظ إن وُجدت في الشيت
    comportement: Number(0),
    comportement_details: '',
    comportement_commentaire: '',
    date: new Date().toLocaleDateString()
  };
}
async function addStudent(){
  const btn = qs('btnAdd'); setLoading(btn,true);
  try{
    const s = readFormValues();
    if(!s.nom || !s.prenom){ alert('Nom et prénom requis'); return; }
    const r = await backend.create(s);
    if(r && r.ok===false){ throw new Error(r.error||'create failed'); }
    await loadStudents();
    clearForm();
    toast('Élève ajouté.');
  } catch(e){ alert(e.message || "Erreur lors de l'ajout."); }
  finally{ setLoading(btn,false); }
}
function clearForm(){
  ['nom','prenom','classe','notes','ecriture','lecture','vocabulaire','grammaire','conjugaison','orthographe'].forEach(id=>qs(id).value='');
  qs('sexe').value='H';
}

/* ================== List / Filters / Sort ================== */
function uniqueClasses(){ const set = new Set(students.map(s=>s.classe).filter(Boolean)); return ['__all__', ...[...set].sort()]; }
let _classesSignature = '';
function populateFilter(){
  const classes = uniqueClasses();
  const sig = classes.join('|');
  if (sig === _classesSignature) return;
  _classesSignature = sig;
  const sel = qs('filterClasse'); const prev = sel.value;
  sel.innerHTML = classes.map(c=>`<option value="${c}">${c==='__all__'?'Toutes les classes':c}</option>`).join('');
  sel.value = [...sel.options].some(o=>o.value===prev) ? prev : '__all__';
}
function resetFilters(){ qs('search').value=''; qs('filterClasse').value='__all__'; qs('sortBy').value='name-asc'; renderList(); }
function renderList(){
  populateFilter();
  const q = (qs('search').value||'').toLowerCase().trim();
  const classe = qs('filterClasse').value;
  const sortBy = qs('sortBy').value;
  let list = [...students];

  list = list.filter(s=>{
    const name = (s.nom+' '+s.prenom).toLowerCase();
    const okQ = !q || name.includes(q);
    const okC = classe==='__all__' || !classe || s.classe===classe;
    return okQ && okC;
  });

  if(sortBy==='name-asc') list.sort((a,b)=> (a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom));
  if(sortBy==='name-desc') list.sort((a,b)=> (b.nom+' '+b.prenom).localeCompare(a.nom+' '+a.prenom));
  if(sortBy==='classe-asc') list.sort((a,b)=> (a.classe||'').localeCompare(b.classe||''));
  if(sortBy==='classe-desc') list.sort((a,b)=> (b.classe||'').localeCompare(a.classe||''));

  const ul = qs('list'); ul.innerHTML='';
  list.forEach(s=>{
    const idx = students.indexOf(s);
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="left">
        <div class="emoji">${s.sexe==='H'?'👨':'👩'}</div>
        <div>
          <div class="name">${s.nom} ${s.prenom}</div>
          <div style="font-size:12px; color:var(--sub)">${s.classe||'—'}</div>
          ${s.comportement!==undefined && s.comportement!=='' ? `<div class="pill" style="background:var(--muted);color:var(--sub);padding:4px 8px;border-radius:8px;font-size:12px;margin-top:4px">Comportement: ${s.comportement}/20</div>`:''}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn-ghost" title="Voir le rapport (onglet)" onclick="openModal(${idx}, false)"><i class="fa-solid fa-file-lines"></i> Rapport</button>
        <button class="btn btn-behav" title="Évaluer le comportement" onclick="openBehav(${idx})"><i class="fa-solid fa-face-smile"></i> Comportement</button>
        <button class="btn btn-edit" title="Modifier" onclick="openModal(${idx}, true)"><i class="fa-solid fa-pen-to-square"></i> Modifier</button>
        <button class="btn btn-del" title="Supprimer" onclick="deleteStudent(${idx})"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    ul.appendChild(li);
  });
}

/* ================== Delete ================== */
async function deleteStudent(arrIndex){
  const s = students[arrIndex]; if(!s) return;
  if(!confirm('Supprimer cet élève ?')) return;
  try{
    const r = await backend.remove(s.index);
    if(r && r.ok===false){ throw new Error(r.error||'delete failed'); }
    await loadStudents();
    closeModal(); closeBehav();
    toast('Élève supprimé.');
  } catch(e){ alert('Suppression impossible.'); }
}

/* ================== Modal / Report ================== */
const modal = qs('modal');

/* فتح تبويب وكتابة المحتوى — مع ثلاث طبقات تسامح لتفادي التبويب الفارغ */
function safeOpenAndWrite(html){
  // 1) افتح تبويب عادي بدون مفاتيح تمنع الكتابة
  const w = window.open('about:blank', '_blank');
  if(!w){ alert('Le navigateur a bloqué la fenêtre. Autorisez les popups.'); return null; }

  // 2) محاولة مباشرة
  try{
    w.document.open();
    w.document.write(html);
    w.document.close();
    return w;
  }catch(e){ /* تجاهل */ }

  // 3) محاولة مؤجلة بعد onload
  try{
    w.onload = ()=> {
      try{
        w.document.open();
        w.document.write(html);
        w.document.close();
      }catch(e2){
        // 4) ملاذ أخير: data URL (يعمل في معظم المتصفحات ويتيح الطباعة)
        try{ w.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }catch(e3){}
      }
    };
    return w;
  }catch(e){ /* تجاهل */ }

  // 4) إن فشل كل شيء — data URL فورًا
  try{ w.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }catch(_) {}
  return w;
}

/* صفحة التقرير (HTML كامل) — تدعم الطباعة التلقائية وإغلاق التبويب بعد الطباعة */
function buildReportHTML(s, tableHtml, chartImg, pct, pedago, behavHtml, notesSafe, opts){
  const autoPrint = !!(opts && opts.autoPrint);
  const autoClose = !!(opts && opts.autoCloseAfter);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Rapport — ${s.nom} ${s.prenom}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{ margin:0; font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:#0d1624; color:#eaf4ff; }
  header{ position:sticky; top:0; z-index:10; background:#0f1a2b; border-bottom:1px solid #12223a; }
  .wrap{ max-width:900px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px }
  .title{ font-weight:800; }
  .actions{ display:flex; gap:8px; flex-wrap:wrap }
  .btn{ background:#00B4D8; color:#06202a; border:none; border-radius:10px; padding:8px 12px; cursor:pointer; font-weight:700 }
  .btn-ghost{ background:transparent; color:#cfe8f6; border:1px solid #1b3550 }
  main{ max-width:900px; margin:18px auto; padding:0 16px 30px }
  .card{ background:#0f1a2b; border:1px solid #12223a; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35); padding:14px; margin-bottom:12px }
  table{ width:100%; border-collapse:collapse; }
  th,td{ border-bottom:1px solid #14273a; padding:8px; text-align:left; font-size:14px }
  th{ background:#0c1b2d; color:#a9c3d8; font-weight:700 }
  .narrative{ background:#0e2033; border:1px solid #17314a; padding:10px; border-radius:8px; line-height:1.5 }
  .progress-wrap{ background:#0e2033; border:1px solid #17314a; border-radius:10px; overflow:hidden; }
  .progress{ height:22px; width:${pct}; background:linear-gradient(90deg,#06d6a0,#25d0ff); color:#012; text-align:center; font-weight:800; font-size:13px }
  .meta{ color:#89a7be; margin-top:4px }
  .footer-note{ margin-top:18px; font-size:12px; color:#8aa2b6 }
  .float-nav{ position:fixed; right:14px; bottom:14px; display:flex; flex-direction:column; gap:8px }
  .fab{ background:#102334; color:#fff; border:none; border-radius:999px; width:44px; height:44px; cursor:pointer; font-size:18px }
  @media print { .float-nav, header .actions{ display:none } body{ background:#fff; color:#111 } .card{ background:#fff; border-color:#e6edf4; box-shadow:none } th,td{ border-bottom:1px solid #e6edf4 } .narrative{ background:#f7fafc; border-color:#e6edf4; color:#112 } }
</style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="title">Rapport pédagogique — ${s.nom} ${s.prenom}</div>
      <div class="actions">
        <button class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
        <button class="btn btn-ghost" onclick="window.close()">✖ Fermer</button>
      </div>
    </div>
  </header>

  <main>
    <section class="card">
      <div><b>Classe:</b> ${s.classe || '—'} &nbsp; | &nbsp; <b>Date:</b> ${s.date || new Date().toLocaleDateString()}</div>
      <div class="meta"><b>Niveau global:</b> ${pct}</div>
      <div class="progress-wrap" style="margin-top:6px"><div class="progress">${pct}</div></div>
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Tableau des compétences</h3>
      ${tableHtml}
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Graphique</h3>
      <div style="text-align:center">
        <img src="${chartImg}" alt="Graphique des scores" style="max-width:100%; height:auto; border:1px solid #17314a; border-radius:8px; background:#0e2033">
      </div>
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Analyse pédagogique</h3>
      <div class="narrative">${pedago}</div>
      ${behavHtml ? `<div class="narrative" style="margin-top:10px"><b>Comportement:</b> ${s.comportement}/20<br>${behavHtml}</div>` : ''}
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Notes du professeur</h3>
      <div class="narrative">${notesSafe}</div>
      <div class="footer-note">Généré depuis l'application Suivi des élèves.</div>
    </section>
  </main>

  <div class="float-nav">
    <button class="fab" title="Haut" onclick="window.scrollTo({top:0,behavior:'smooth'})">⬆</button>
    <button class="fab" title="Bas" onclick="window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})">⬇</button>
  </div>

  <script>
    (function(){
      var auto = ${autoPrint ? 'true' : 'false'};
      var autoClose = ${autoClose ? 'true' : 'false'};
      if (auto) {
        window.addEventListener('load', function(){
          setTimeout(function(){
            try { window.focus(); } catch(e){}
            try { window.print(); } catch(e){}
          }, 300);
        });
        if ('onafterprint' in window) {
          window.onafterprint = function(){ if(autoClose) window.close(); };
        } else {
          if (autoClose) setTimeout(function(){ try{ window.close(); }catch(e){} }, 1200);
        }
      }
    })();
  </script>
</body>
</html>`;
}

/* توليد صورة الرسم البياني خارج النافذة (offscreen) */
function buildChartImage(values){
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || '#00B4D8';
  const tempChart = new Chart(ctx, {
    type:'bar',
    data:{ labels: skillsLabels, datasets:[{ label:'Score /20', data: values, backgroundColor: accent+'cc', borderColor: accent, borderWidth:1, borderRadius:8 }] },
    options:{ responsive:false, animation:false, scales:{ y:{ beginAtZero:true, max:MAX_SCORE, ticks:{ stepSize:2 } } }, plugins:{ legend:{ display:false } } }
  });
  const img = canvas.toDataURL('image/png');
  tempChart.destroy();
  return img;
}

/* افتح تقرير لتلميذ في تبويب جديد */
function openReportForStudent(s, opts={}){
  const values = [s.ecriture,s.lecture,s.vocabulaire,s.grammaire,s.conjugaison,s.orthographe].map(v=>Number(v)||0);
  const pct = (()=>{
    const sum = values.reduce((a,b)=>a+b,0);
    return Math.round((sum/(values.length*MAX_SCORE))*100) + '%';
  })();

  const rows = skillsLabels.map((lab,i)=>`<tr><td>${lab}</td><td>${values[i]}</td></tr>`).join('');
  const tableHtml = `<table><thead><tr><th>Compétence</th><th>Score /20</th></tr></thead><tbody>${rows}</tbody></table>`;
  const pedago = generatePedagoText(s);

  const notesSafe = (s.notes||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');

  const behavHtml = (typeof s.comportement!=='undefined' && s.comportement!=='')
    ? `${(s.comportement_details||'—').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${
        s.comportement_commentaire ? ('<br><b>Commentaire:</b> ' + (s.comportement_commentaire||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')) : ''}`
    : '';

  const chartImg = buildChartImage(values);
  const html = buildReportHTML(s, tableHtml, chartImg, pct, pedago, behavHtml, notesSafe, opts);
  const w = safeOpenAndWrite(html);
  return w;
}

/* عند الضغط على Rapport في القائمة */
function openReportFromList(idx){
  activeIdx = idx;
  const s = students[idx];
  if(!s){ alert('Élève introuvable'); return; }
  openReportForStudent(s, { autoPrint:false, autoCloseAfter:false });
}
window.openReportFromList = openReportFromList;

/* openModal: إذا editMode=false نفتح تبويب التقرير بدل الـmodal */
function openModal(arrIndex, editMode){
  if(!editMode){
    openReportFromList(arrIndex);
    return;
  }
  // وضع التعديل داخل المودال
  activeIdx = arrIndex;
  const s = students[arrIndex]; if(!s) return;

  qs('modalTitle').textContent = `${s.nom} ${s.prenom}`;
  qs('modalSub').textContent = s.classe ? `Classe: ${s.classe}` : '—';
  qs('modalDate').textContent = s.date || '—';

  const tbody = document.querySelector('#skillsTable tbody'); if (tbody) {
    tbody.innerHTML = '';
    const arr = [s.ecriture,s.lecture,s.vocabulaire,s.grammaire,s.conjugaison,s.orthographe];
    skillsLabels.forEach((lab,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${lab}</td><td>${arr[i] ?? 0}</td>`; tbody.appendChild(tr); });
    qs('pedagoText').innerHTML = generatePedagoText(s);
    qs('modalNotes').value = s.notes || '';
    renderStudentChart(arr);
    const sum = arr.reduce((a,b)=>a+(Number(b)||0),0);
    const pct = Math.round((sum/(arr.length*MAX_SCORE))*100) + '%';
    const prog = qs('modalProgress'); if(prog){ prog.style.width = pct; prog.textContent = pct; }
  }

  // ملخّص comportement
  const bhBox = qs('behavSummary');
  if (bhBox) {
    if (typeof s.comportement !== 'undefined' && s.comportement !== '' ){
      bhBox.style.display='block';
      const details = s.comportement_details ? ` — <i>${(s.comportement_details||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</i>` : '';
      const comment = s.comportement_commentaire ? `<br><b>Commentaire:</b> ${(s.comportement_commentaire||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}` : '';
      bhBox.innerHTML = `<b>Comportement:</b> ${s.comportement}/20${details}${comment}`;
    } else { bhBox.style.display='none'; bhBox.innerHTML = ''; }
  }

  toggleEditMode(true);
  modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
}
window.openModal = openModal;

function closeModal(){
  modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
  activeIdx = null;
  if(chartInstance){ chartInstance.destroy(); chartInstance = null; }
}
qs('btnCloseModal')?.addEventListener('click', closeModal);
qs('btnCloseModal2')?.addEventListener('click', closeModal);

function renderStudentChart(data){
  const ctx = qs('studentChart'); if(!ctx) return;
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type:'bar',
    data:{ labels: skillsLabels, datasets:[{ label:'Score /20', data: data.map(v=>Number(v)||0), backgroundColor:'rgba(0,180,216,0.75)', borderColor:'#00B4D8', borderWidth:1, borderRadius:8 }] },
    options:{ animation:{ duration:700, easing:'easeOutQuart' }, scales:{ y:{ beginAtZero:true, max:MAX_SCORE, ticks:{ stepSize:2 } } }, plugins:{ legend:{ display:false } } }
  });
}

/* ================== Pedagogical (français, par compétence) ================== */
function describeSkillFR(name, v){
  if (v < 10) return `<b>${name}</b> (${v}/20) : acquis fragiles ; renforcer les bases par des exercices guidés.`;
  if (v < 15) return `<b>${name}</b> (${v}/20) : niveau satisfaisant ; consolider par une pratique régulière.`;
  return `<b>${name}</b> (${v}/20) : très bon niveau ; proposer des activités d’enrichissement.`;
}
function generatePedagoText(s){
  const map = {
    "Écriture": s.ecriture, "Lecture": s.lecture, "Vocabulaire": s.vocabulaire,
    "Grammaire": s.grammaire, "Conjugaison": s.conjugaison, "Orthographe": s.orthographe
  };
  const scores = Object.values(map).map(v=>Number(v)||0);
  const mean = Math.round((scores.reduce((a,b)=>a+b,0)/scores.length)*100)/100;
  const best = Math.max(...scores), worst = Math.min(...scores);
  const skills = Object.keys(map);
  const bestIdx = scores.indexOf(best), worstIdx = scores.indexOf(worst);

  let niveau;
  if(mean >= 15) niveau='très bon ensemble de compétences';
  else if(mean >= 10) niveau='compétences en progression';
  else niveau='besoin d’un accompagnement renforcé';

  const lignes = skills.map((k,i)=> describeSkillFR(k, scores[i]));
  return `<strong>Analyse pédagogique :</strong> L’élève présente ${niveau} (moyenne ${mean}/20). 
          Point fort : <strong>${skills[bestIdx]}</strong> (${best}/20) ; axe prioritaire : <strong>${skills[worstIdx]}</strong> (${worst}/20).
          <br><br><strong>Appréciation par compétence :</strong><br>${lignes.join('<br>')}`;
}

/* ================== Edit mode ================== */
function toggleEditMode(enable){
  const notes = qs('modalNotes');
  const saveBtn = qs('saveEditBtn');
  const toggleBtn = qs('toggleEditBtn');

  if(enable){
    const tbody = document.querySelector('#skillsTable tbody');
    const s = students[activeIdx]; if (tbody && s){
      tbody.innerHTML='';
      const keys = ['ecriture','lecture','vocabulaire','grammaire','conjugaison','orthographe'];
      keys.forEach((k,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${skillsLabels[i]}</td><td><input type="number" min="0" max="${MAX_SCORE}" id="edit_${k}" value="${s[k] ?? 0}" style="width:100%; background:linear-gradient(180deg,#072939,#0a2f43); color:#dff6ff; border-radius:6px; border:1px solid rgba(255,255,255,.06); padding:6px"></td>`;
        tbody.appendChild(tr);
      });
    }
    if (notes) notes.style.display='block';
    if (saveBtn) saveBtn.style.display='inline-flex';
    if (toggleBtn){
      toggleBtn.textContent='Annuler édition';
      toggleBtn.onclick = ()=>toggleEditMode(false);
    }
  } else {
    const s = students[activeIdx]; if(!s) return;
    const tbody = document.querySelector('#skillsTable tbody'); if (tbody){
      tbody.innerHTML='';
      const arr = [s.ecriture,s.lecture,s.vocabulaire,s.grammaire,s.conjugaison,s.orthographe];
      arr.forEach((val,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${skillsLabels[i]}</td><td>${val ?? 0}</td>`; tbody.appendChild(tr); });
      qs('pedagoText').innerHTML = generatePedagoText(s);
      renderStudentChart(arr);
      qs('modalNotes').value = s.notes || '';
    }
    if (saveBtn) saveBtn.style.display = 'none';
    if (toggleBtn){
      toggleBtn.textContent='Mode édition';
      toggleBtn.onclick = ()=>toggleEditMode(true);
    }
  }
}
async function saveEdit(){
  if(activeIdx === null) return;
  const s = students[activeIdx];
  ['ecriture','lecture','vocabulaire','grammaire','conjugaison','orthographe'].forEach(k=>{
    const el = qs('edit_'+k); if(el) s[k] = clamp(el.value);
  });
  s.notes = qs('modalNotes').value || '';
  s.date = new Date().toLocaleDateString();
  try{
    const r = await backend.update(s.index, s);
    if(r && r.ok===false){ throw new Error(r.error||'update failed'); }
    await loadStudents();
    toggleEditMode(false);
    renderList();
    const md = qs('modalDate'); if(md) md.textContent = s.date;
    toast('Modifications enregistrées.');
  }catch(err){ alert('Échec de la sauvegarde.'); }
}
window.saveEdit = saveEdit;

/* ================== Print / PDF ================== */
/* زر Imprimer: يفتح التبويب ويشغّل الطباعة تلقائياً (لا يُغلق التبويب) */
function printReport(){
  if(activeIdx===null){ alert("Ouvrez d'abord un élève."); return; }
  const s = students[activeIdx];
  openReportForStudent(s, { autoPrint:true, autoCloseAfter:false });
}
/* زر PDF: يفتح التبويب، يشغّل الطباعة تلقائياً، ثم يُغلق التبويب (احفظ كـ PDF) */
function downloadPDF(){
  if(activeIdx===null){ alert("Ouvrez d'abord un élève."); return; }
  const s = students[activeIdx];
  openReportForStudent(s, { autoPrint:true, autoCloseAfter:true });
}
window.printReport = printReport;
window.downloadPDF = downloadPDF;

/* ================== Comportement ================== */
const bhModal = qs('behavModal');
function behavComputeScore(){
  let base = 20;
  if (qs('bh_bavard').checked) base -= 2;
  if (qs('bh_irrespect').checked) base -= 4;
  if (qs('bh_devoir').checked) base -= 2;
  const retards = Math.max(0, Number(qs('bh_retard').value)||0);
  const oublis = Math.max(0, Number(qs('bh_oubli').value)||0);
  base -= retards * 1;
  base -= oublis * 1;
  if (qs('bh_participation').checked) base += 2;
  if (qs('bh_aide').checked) base += 1;
  base = Math.max(0, Math.min(20, base));
  qs('bh_score').textContent = base;
  return base;
}
['bh_bavard','bh_irrespect','bh_devoir','bh_participation','bh_aide','bh_retard','bh_oubli'].forEach(id=>{
  document.addEventListener('input', (e)=>{ if(e.target && e.target.id===id) behavComputeScore(); });
});
function openBehav(arrIndex){
  activeIdx = arrIndex;
  const s = students[arrIndex]; if(!s) return;
  qs('behavTitle').textContent = `Évaluation — ${s.nom} ${s.prenom}`;
  qs('behavSub').textContent = s.classe ? `Classe: ${s.classe}` : '—';
  ['bh_bavard','bh_irrespect','bh_devoir','bh_participation','bh_aide'].forEach(id=> qs(id).checked=false);
  qs('bh_retard').value=0; qs('bh_oubli').value=0; qs('bh_comment').value = s.comportement_commentaire || '';
  behavComputeScore();
  bhModal.classList.add('show'); bhModal.setAttribute('aria-hidden','false');
}
function closeBehav(){ bhModal.classList.remove('show'); bhModal.setAttribute('aria-hidden','true'); }
qs('bh_cancel').addEventListener('click', closeBehav);
qs('behavClose').addEventListener('click', closeBehav);

async function saveBehav(){
  if(activeIdx===null) return;
  const s = students[activeIdx];
  const retards = Math.max(0, Number(qs('bh_retard').value)||0);
  const oublis = Math.max(0, Number(qs('bh_oubli').value)||0);

  const detailsArr = [];
  if (qs('bh_bavard').checked) detailsArr.push('Bavardage');
  if (qs('bh_irrespect').checked) detailsArr.push('Manque de respect');
  if (qs('bh_devoir').checked) detailsArr.push('Devoir non remis');
  if (retards>0) detailsArr.push(`Retards x${retards}`);
  if (oublis>0) detailsArr.push(`Oubli matériel x${oublis}`);
  if (qs('bh_participation').checked) detailsArr.push('Participation active (+)');
  if (qs('bh_aide').checked) detailsArr.push('Aide aux camarades (+)');

  s.comportement = behavComputeScore();
  s.comportement_details = detailsArr.join(', ');
  s.comportement_commentaire = (qs('bh_comment').value||'').trim();
  s.date = new Date().toLocaleDateString();

  try{
    const r = await backend.update(s.index, s);
    if(r && r.ok===false){ throw new Error(r.error||'update failed'); }
    await loadStudents();
    closeBehav();
    toast('Comportement enregistré.');
  }catch(e){ alert('Échec de la sauvegarde du comportement.'); }
}
qs('bh_save').addEventListener('click', saveBehav);

/* ================== Import Excel/CSV ================== */
const headerMap = {
  nom:['nom','Nom','NOM'],
  prenom:['prenom','prénom','Prenom','Prénom','PRENOM'],
  sexe:['sexe','Sexe','SEXE','gender','Genre'],
  classe:['classe','Classe','CLASS'],
  notes:['notes','Notes','Remarques','Commentaire'],
  ecriture:['ecriture','Écriture','Ecriture','ECRITURE'],
  lecture:['lecture','Lecture','LECTURE'],
  vocabulaire:['vocabulaire','Vocabulaire','VOCABULAIRE'],
  grammaire:['grammaire','Grammaire','GRAMMAIRE'],
  conjugaison:['conjugaison','Conjugaison','CONJUGAISON'],
  orthographe:['orthographe','Orthographe','ORTHOGRAPHE'],
  comportement:['comportement','Comportement'],
  comportement_details:['comportement_details','Comportement details'],
  comportement_commentaire:['comportement_commentaire','Comportement commentaire'],
  date:['date','Date']
};
function normalizeRow(row){
  const obj = {};
  for(const key in headerMap){
    const aliases = headerMap[key];
    let foundVal = '';
    for(const alias of aliases){
      if(row.hasOwnProperty(alias)){ foundVal = row[alias]; break; }
    }
    obj[key] = foundVal ?? '';
  }
  ['ecriture','lecture','vocabulaire','grammaire','conjugaison','orthographe','comportement'].forEach(k=>{
    obj[k] = (k==='comportement') ? Math.max(0, Math.min(20, Number(obj[k])||0)) : clamp(obj[k]);
  });
  obj.sexe = (String(obj.sexe||'H').toUpperCase().startsWith('F')) ? 'F' : 'H';
  obj.date = obj.date || new Date().toLocaleDateString();
  return obj;
}
async function importRows(rows){
  if(!rows.length){ toast('Aucune donnée trouvée.'); return; }
  if(!confirm(`Importer ${rows.length} enregistrements ?`)) return;
  for (let i=0;i<rows.length;i++){
    const r = normalizeRow(rows[i]);
    try{ await backend.create(r); } catch(e){ console.warn('create failed row', i, e); }
  }
  await loadStudents();
  toast('Import terminé.');
}
function handleExcelFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, {defval:''});
    importRows(json);
  };
  reader.readAsArrayBuffer(file);
}

/* ================== Events & Load ================== */
function attachEvents(){
  qs('btnAdd').addEventListener('click', addStudent);
  qs('btnClear').addEventListener('click', clearForm);
  qs('btnReset').addEventListener('click', resetFilters);
  qs('btnRefresh').addEventListener('click', loadStudents);
  qs('search').addEventListener('input', renderListDebounced);
  qs('filterClasse').addEventListener('change', renderList);
  qs('sortBy').addEventListener('change', renderList);
  qs('toggleEditBtn').addEventListener('click', ()=>toggleEditMode(true));
  qs('saveEditBtn')?.addEventListener('click', saveEdit);

  // زرّي الطباعة و PDF منفصلين تمامًا
  qs('btnPrint').addEventListener('click', printReport);
  qs('btnPDF').addEventListener('click', downloadPDF);

  qs('btnCloseModal2')?.addEventListener('click', closeModal);
  qs('btnCloseModal')?.addEventListener('click', closeModal);

  // Comportement
  qs('bh_save').addEventListener('click', saveBehav);
  qs('bh_cancel').addEventListener('click', closeBehav);
  qs('behavClose').addEventListener('click', closeBehav);

  // Import Excel/CSV
  qs('btnImport').addEventListener('click', ()=> qs('excelInput').click());
  qs('excelInput').addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    if(!/\.(xlsx|xls|csv)$/i.test(file.name)){ alert('Veuillez choisir un fichier Excel/CSV.'); return; }
    handleExcelFile(file);
    e.target.value='';
  });
}
async function loadStudents(){
  const btn = qs('btnRefresh'); setLoading(btn, true);
  try{
    const data = await backend.getAll();
    students = Array.isArray(data) ? data.map((r,i)=>({
      index: r.index ?? i,
      nom: r.nom || r.Nom || '',
      prenom: r.prenom || r.Prenom || r['Prénom'] || '',
      sexe: r.sexe || r.Sexe || 'H',
      classe: r.classe || r.Classe || '',
      notes: r.notes || r.Notes || '',
      ecriture: Number(r.ecriture ?? r.Ecriture ?? 0),
      lecture: Number(r.lecture ?? r.Lecture ?? 0),
      vocabulaire: Number(r.vocabulaire ?? r.Vocabulaire ?? 0),
      grammaire: Number(r.grammaire ?? r.Grammaire ?? 0),
      conjugaison: Number(r.conjugaison ?? r.Conjugaison ?? 0),
      orthographe: Number(r.orthographe ?? r.Orthographe ?? 0),
      comportement: (r.comportement ?? r.Comportement ?? ''),
      comportement_details: (r.comportement_details ?? r['Comportement details'] ?? ''),
      comportement_commentaire: (r.comportement_commentaire ?? r['Comportement commentaire'] ?? ''),
      date: r.date || r.Date || new Date().toLocaleDateString()
    })) : [];
    renderList();
  }catch(err){
    alert("Impossible de charger les données. Vérifiez رابط الويب وصلاحيات الوصول.");
  }finally{
    setLoading(btn, false);
  }
}
function init(){ attachEvents(); loadStudents(); }
init();

