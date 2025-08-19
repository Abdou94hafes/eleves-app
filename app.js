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
function debounce(fn, wait=160){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
const renderListDebounced = debounce(renderList, 160);

/* ================== API (Robust JSON parsing) ================== */
async function getJSON(params){
  const url = API_BASE + '?' + new URLSearchParams(params).toString();
  let res, text;
  try { res = await fetch(url, { method: 'GET', cache: 'no-store' }); }
  catch (e) { alert('Erreur réseau.'); throw e; }

  try { text = await res.text(); } catch(e){ throw new Error('Réponse vide'); }

  // Clean possible XSSI prelude / HTML wrappers and extract JSON
  const cleaned = text.trim()
    .replace(/^\)\]\}',?\s*/,'')
    .replace(/^[^\[{]*([\[{].*[\]}]).*$/s, '$1');

  try { return JSON.parse(cleaned); }
  catch(e){
    // last resort: try direct if it already is clean json, else error
    try { return JSON.parse(text); } catch(_) {
      console.error('Réponse non JSON:', text.slice(0,300));
      throw new Error("Réponse non valide depuis le Web App (vérifiez les permissions).");
    }
  }
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
    nom: qs('nom')?.value.trim() || '',
    prenom: qs('prenom')?.value.trim() || '',
    sexe: qs('sexe')?.value || 'H',
    classe: qs('classe')?.value.trim() || '',
    notes: qs('notes')?.value.trim() || '',
    ecriture: clamp(qs('ecriture')?.value),
    lecture: clamp(qs('lecture')?.value),
    vocabulaire: clamp(qs('vocabulaire')?.value),
    grammaire: clamp(qs('grammaire')?.value),
    conjugaison: clamp(qs('conjugaison')?.value),
    orthographe: clamp(qs('orthographe')?.value),
    // Champs comportement (facultatifs) — compatibles si غير موجودة بالشيت
    comportement: 0,
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
  ['nom','prenom','classe','notes','ecriture','lecture','vocabulaire','grammaire','conjugaison','orthographe'].forEach(id=>{ if(qs(id)) qs(id).value=''; });
  if(qs('sexe')) qs('sexe').value='H';
}

/* ================== List / Filters / Sort ================== */
function uniqueClasses(){ const set = new Set(students.map(s=>s.classe).filter(Boolean)); return ['__all__', ...[...set].sort()]; }
let _classesSignature = '';
function populateFilter(){
  const classes = uniqueClasses();
  const sig = classes.join('|');
  if (sig === _classesSignature) return;
  _classesSignature = sig;
  const sel = qs('filterClasse'); if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = classes.map(c=>`<option value="${c}">${c==='__all__'?'Toutes les classes':c}</option>`).join('');
  sel.value = [...sel.options].some(o=>o.value===prev) ? prev : '__all__';
}
function resetFilters(){ if(qs('search')) qs('search').value=''; if(qs('filterClasse')) qs('filterClasse').value='__all__'; if(qs('sortBy')) qs('sortBy').value='name-asc'; renderList(); }

function renderList(){
  populateFilter();
  const q = (qs('search')?.value||'').toLowerCase().trim();
  const classe = qs('filterClasse')?.value || '__all__';
  const sortBy = qs('sortBy')?.value || 'name-asc';
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

  const ul = qs('list'); if(!ul) return;
  ul.innerHTML='';
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

/* فتح تبويب وكتابة المحتوى — fallback ذكي لتفادي تبويب فارغ */
function safeOpenAndWrite(html){
  const w = window.open('about:blank', '_blank');
  if(!w){ alert('Le navigateur a bloqué la fenêtre. Autorisez les popups.'); return null; }
  try{
    w.document.open(); w.document.write(html); w.document.close();
  }catch(_){
    try{
      w.onload = ()=>{ try{ w.document.open(); w.document.write(html); w.document.close(); }catch(__){ try{ w.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }catch(___){} } };
    }catch(__){
      try{ w.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }catch(____){}
    }
  }
  return w;
}


/* ========= Analyse IA (FR) — synthèse riche + conseils ciblés ========= */
function generatePedagoText(s){
  const skills = ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"];
  const values = [
    Number(s.ecriture)||0, Number(s.lecture)||0, Number(s.vocabulaire)||0,
    Number(s.grammaire)||0, Number(s.conjugaison)||0, Number(s.orthographe)||0
  ];

  // Statistiques
  const moyenne = +(values.reduce((a,b)=>a+b,0) / values.length).toFixed(2);
  const bestVal = Math.max(...values);
  const worstVal = Math.min(...values);
  const idxBest = values.indexOf(bestVal);
  const idxWorst = values.indexOf(worstVal);
  const variance = values.reduce((acc,v)=> acc + Math.pow(v - moyenne, 2), 0) / values.length;
  const ecartType = Math.sqrt(variance);
  const regul = ecartType < 3 ? "profil régulier" : (ecartType < 5 ? "profil contrasté" : "profil très contrasté");

  let niveauGlobal;
  if (moyenne >= 16) niveauGlobal = "excellente maîtrise globale";
  else if (moyenne >= 14) niveauGlobal = "maîtrise solide";
  else if (moyenne >= 12) niveauGlobal = "bon niveau en progression";
  else if (moyenne >= 10) niveauGlobal = "socle en cours de consolidation";
  else niveauGlobal = "besoin d’un accompagnement renforcé";

  // Classement des compétences
  const fortes = [], aRenforcer = [], prioritaires = [];
  const label = (k,v)=> `${k} (${v}/20)`;
  skills.forEach((k,i)=>{
    const v = values[i];
    if (v >= 15) fortes.push(label(k,v));
    else if (v >= 10) aRenforcer.push(label(k,v));
    else prioritaires.push(label(k,v));
  });

  return `
    <div><strong>Synthèse :</strong> ${niveauGlobal} (moyenne ${moyenne}/20), ${regul}.
      Point fort : <strong>${skills[idxBest]}</strong> (${bestVal}/20), axe prioritaire : <strong>${skills[idxWorst]}</strong> (${worstVal}/20).
    </div>
    ${fortes.length ? `<div style="margin-top:6px"><strong>Forces :</strong> ${fortes.join(", ")}.</div>` : ""}
    ${aRenforcer.length ? `<div style="margin-top:4px"><strong>À consolider :</strong> ${aRenforcer.join(", ")}.</div>` : ""}
    ${prioritaires.length ? `<div style="margin-top:4px"><strong>Prioritaires :</strong> ${prioritaires.join(", ")}.</div>` : ""}
  `;
}

/* ========= Conseils détaillés (FR) par compétence — paragraphes concrets ========= */
function buildSkillAdvice(s){
  const BANK = {
    "Écriture": {
      low:  "Renforcer la structure du paragraphe (idée principale + exemples), phrases simples puis complexes, relecture guidée et checklist.",
      mid:  "Varier les types de textes (récit, description, dialogue), utiliser des connecteurs logiques et enrichir le vocabulaire.",
      high: "Projets d’écriture longue, argumentation structurée, pastiches d’auteurs, amélioration du style et de la cohérence globale."
    },
    "Lecture": {
      low:  "Repérage d’informations explicites, surlignage des mots-clés, questionnement par paragraphe, reformulation orale.",
      mid:  "Développer l’inférence, résumer en quelques phrases, comparer deux textes courts sur un même thème.",
      high: "Analyses fines (implicite/point de vue), lectures suivies, mise en relation de textes d’auteurs différents."
    },
    "Vocabulaire": {
      low:  "Fiches lexicales thématiques, mémorisation active (cartes), réemploi dans des phrases courtes et dictées de mots.",
      mid:  "Synonymes/antonymes en contexte, familles de mots, champs lexicaux adaptés aux séquences d’étude.",
      high: "Nuancer le registre et les connotations, jeux d’enrichissement, écrits créatifs avec contraintes lexicales."
    },
    "Grammaire": {
      low:  "Accords de base (GN, sujet/verbe), manipulations de phrases, exercices auto-correctifs ciblés.",
      mid:  "Subordonnées fréquentes, fonctions essentielles, consolidation des accords complexes.",
      high: "Syntaxe avancée, transformations de phrases, analyse grammaticale d’extraits littéraires."
    },
    "Conjugaison": {
      low:  "Présent/passé composé/imparfait (verbes fréquents), tableaux modèles, entraînement court quotidien.",
      mid:  "Temps composés et valeurs, verbes pronominaux et irréguliers, réécriture de textes.",
      high: "Concordance des temps, styles (narration/discours), dictées négociées et productions guidées."
    },
    "Orthographe": {
      low:  "Règles de base (accords GN, pluriel, homophones), dictées courtes et relecture syllabique.",
      mid:  "Accords des participes passés, homophones grammaticaux, listes personnalisées d’erreurs récurrentes.",
      high: "Relecture orthographique par étapes, chasses aux erreurs dans des textes plus longs et complexes."
    }
  };

  const skills = ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"];
  const values = [
    Number(s.ecriture)||0, Number(s.lecture)||0, Number(s.vocabulaire)||0,
    Number(s.grammaire)||0, Number(s.conjugaison)||0, Number(s.orthographe)||0
  ];

  const pick = (k,v)=>{
    if (v < 10) return BANK[k].low;
    if (v < 15) return BANK[k].mid;
    return BANK[k].high;
  };

  return `
    <div style="display:grid;gap:10px">
      ${skills.map((k,i)=>`
        <div style="background:#0e2033;border:1px solid #17314a;border-radius:10px;padding:10px">
          <div style="font-weight:700;margin-bottom:4px">${k} — <span style="color:#7ec9ff">${values[i]}/20</span></div>
          <div>${pick(k, values[i])}</div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ========= متوسط القسم للمقارنة (إن وُجد زملاء في نفس القسم) ========= */
function computeClassAverages(referenceStudent){
  if (!Array.isArray(students) || !students.length) return null;
  const sameClass = students.filter(u => (u.classe||"") === (referenceStudent.classe||""));
  const pool = sameClass.length >= 2 ? sameClass : students; // إن لم يوجد إلا التلميذ نفسه، خذ كل التلاميذ
  if (!pool.length) return null;

  const sum = [0,0,0,0,0,0];
  let n = 0;
  for (const u of pool){
    const arr = [u.ecriture,u.lecture,u.vocabulaire,u.grammaire,u.conjugaison,u.orthographe].map(x=>Number(x)||0);
    if (arr.some(v => !isNaN(v))) {
      for(let i=0;i<6;i++) sum[i]+=arr[i];
      n++;
    }
  }
  if (n===0) return null;
  return sum.map(x => +(x/n).toFixed(2));
}

/* ========= توليد صور الرسوم (Bar مقارن + Radar) دون فتح التبويب ========= */
function buildChartsImages(values, classAvg){
  // BAR comparatif
  const c1 = document.createElement('canvas'); c1.width=900; c1.height=360;
  const ctx1 = c1.getContext('2d');
  const bar = new Chart(ctx1, {
    type:'bar',
    data:{
      labels: ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"],
      datasets:[
        { label:"Élève", data: values, backgroundColor:'rgba(0,180,216,0.8)', borderColor:'#00B4D8', borderWidth:1, borderRadius:8 },
        ...(classAvg ? [{ label:"Moyenne classe", data: classAvg, backgroundColor:'rgba(106,160,255,0.35)', borderColor:'#6aa0ff', borderWidth:1, borderRadius:8 }] : [])
      ]
    },
    options:{ responsive:false, animation:false, scales:{ y:{ beginAtZero:true, max:MAX_SCORE, ticks:{ stepSize:2 } } }, plugins:{ legend:{ display:true } } }
  });
  const barImg = c1.toDataURL('image/png');
  bar.destroy();

  // RADAR profil
  const c2 = document.createElement('canvas'); c2.width=500; c2.height=500;
  const ctx2 = c2.getContext('2d');
  const radar = new Chart(ctx2, {
    type:'radar',
    data:{
      labels: ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"],
      datasets:[
        { label:"Profil élève", data: values, backgroundColor:'rgba(0,180,216,0.15)', borderColor:'#00B4D8', pointBackgroundColor:'#00B4D8', borderWidth:2 },
        ...(classAvg ? [{ label:"Moyenne classe", data: classAvg, backgroundColor:'rgba(106,160,255,0.12)', borderColor:'#6aa0ff', pointBackgroundColor:'#6aa0ff', borderWidth:2 }] : [])
      ]
    },
    options:{ responsive:false, animation:false, scales:{ r:{ suggestedMin:0, suggestedMax:MAX_SCORE, ticks:{ stepSize:5 } } }, plugins:{ legend:{ display:true } } }
  });
  const radarImg = c2.toDataURL('image/png');
  radar.destroy();

  return { barImg, radarImg };
}

/* ========= صفحة التقرير المحسّنة (HTML كامل) ========= */
function buildReportHTML(s, tableHtml, imgs, pct, pedago, behavHtml, notesSafe, opts){
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
  .wrap{ max-width:980px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px }
  .title{ font-weight:800; }
  .actions{ display:flex; gap:8px; flex-wrap:wrap }
  .btn{ background:#00B4D8; color:#06202a; border:none; border-radius:10px; padding:8px 12px; cursor:pointer; font-weight:700 }
  .btn-ghost{ background:transparent; color:#cfe8f6; border:1px solid #1b3550 }
  main{ max-width:980px; margin:18px auto; padding:0 16px 30px; display:grid; grid-template-columns:1fr; gap:12px }
  .card{ background:#0f1a2b; border:1px solid #12223a; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35); padding:14px }
  .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
  @media (max-width:900px){ .grid-2{ grid-template-columns:1fr } }
  table{ width:100%; border-collapse:collapse; }
  th,td{ border-bottom:1px solid #14273a; padding:8px; text-align:left; font-size:14px }
  th{ background:#0c1b2d; color:#a9c3d8; font-weight:700 }
  .narrative{ background:#0e2033; border:1px solid #17314a; padding:10px; border-radius:8px; line-height:1.55 }
  .progress-wrap{ background:#0e2033; border:1px solid #17314a; border-radius:10px; overflow:hidden; }
  .progress{ height:22px; width:${pct}; background:linear-gradient(90deg,#06d6a0,#25d0ff); color:#012; text-align:center; font-weight:800; font-size:13px }
  .meta{ color:#89a7be; margin-top:4px }
  .footer-note{ margin-top:18px; font-size:12px; color:#8aa2b6 }
  .float-nav{ position:fixed; right:14px; bottom:14px; display:flex; flex-direction:column; gap:8px }
  .fab{ background:#102334; color:#fff; border:none; border-radius:999px; width:44px; height:44px; cursor:pointer; font-size:18px }
  .chart-card{ text-align:center }
  .chart-card img{ max-width:100%; height:auto; border:1px solid #17314a; border-radius:8px; background:#0e2033 }
  @media print { .float-nav, header .actions{ display:none } body{ background:#fff; color:#111 } .card{ background:#fff; border-color:#e6edf4; box-shadow:none } th,td{ border-bottom:1px solid #e6edf4 } .narrative{ background:#f7fafc; border-color:#e6edf4; color:#112 } }
</style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="title">Rapport pédagogique — ${s.nom} ${s.prenom}</div>
      <div class="actions">
        <button class="btn" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
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

    <section class="card grid-2">
      <div>
        <h3 style="margin:0 0 8px">Tableau des compétences</h3>
        ${tableHtml}
      </div>
      <div class="chart-card">
        <h3 style="margin:0 0 8px">Comparaison élève / classe</h3>
        <img src="${imgs.barImg}" alt="Comparaison barres">
      </div>
    </section>

    <section class="card chart-card">
      <h3 style="margin:0 0 8px">Profil radar</h3>
      <img src="${imgs.radarImg}" alt="Profil radar">
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Analyse synthétique (IA)</h3>
      <div class="narrative">${pedago}</div>
      ${behavHtml ? `<div class="narrative" style="margin-top:10px"><b>Comportement:</b> ${s.comportement}/20<br>${behavHtml}</div>` : ''}
    </section>

    <section class="card">
      <h3 style="margin:0 0 8px">Conseils détaillés par compétence</h3>
      <div class="narrative">${buildSkillAdvice(s)}</div>
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

/* ========= فتح تقرير لتلميذ — الآن مع مقارنات وصور متعددة ========= */
function openReportForStudent(s, opts={}){
  const values = [s.ecriture,s.lecture,s.vocabulaire,s.grammaire,s.conjugaison,s.orthographe].map(v=>Number(v)||0);
  const sum = values.reduce((a,b)=>a+b,0);
  const pct = Math.round((sum/(values.length*MAX_SCORE))*100) + '%';

  // جدول compétences
  const rows = ["Écriture","Lecture","Vocabulaire","Grammaire","Conjugaison","Orthographe"]
    .map((lab,i)=>`<tr><td>${lab}</td><td>${values[i]}</td></tr>`).join('');
  const tableHtml = `<table><thead><tr><th>Compétence</th><th>Score /20</th></tr></thead><tbody>${rows}</tbody></table>`;

  // Texte IA (synthèse) + conseils par compétence
  const pedago = generatePedagoText(s);

  // Notes + comportement
  const notesSafe = (s.notes||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');

  const behavHtml = (typeof s.comportement!=='undefined' && s.comportement!=='')
    ? `${(s.comportement_details||'—').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${
        s.comportement_commentaire ? ('<br><b>Commentaire:</b> ' + (s.comportement_commentaire||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')) : ''}`
    : '';

  // متوسط القسم + صور الرسوم
  const classAvg = computeClassAverages(s);
  const imgs = buildChartsImages(values, classAvg);

  const html = buildReportHTML(s, tableHtml, imgs, pct, pedago, behavHtml, notesSafe, opts);
  const w = safeOpenAndWrite(html);
  return w;
}

/* فتح من القائمة */
function openReportFromList(idx){
  activeIdx = idx;
  const s = students[idx];
  if(!s){ alert('Élève introuvable'); return; }
  openReportForStudent(s, { autoPrint:false, autoCloseAfter:false });
}

// صفحة تحرير مستقلة — HTML كامل
function buildEditHTML(s){
  const esc = (v)=> String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Modifier — ${esc(s.nom)} ${esc(s.prenom)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{ --bg:#0D1B2A; --panel:#101e2d; --card:#14273a; --line:#17314a; --accent:#00B4D8; --text:#E0E1DD; --sub:#A9BCD0; --good:#06d6a0; --bad:#e63946; }
  *{box-sizing:border-box} body{margin:0; font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:radial-gradient(800px 400px at 10% -10%, rgba(0,180,216,.06),transparent),var(--bg); color:var(--text)}
  header{ position:sticky; top:0; z-index:10; background:#0f1a2b; border-bottom:1px solid var(--line); }
  .wrap{ max-width:980px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px }
  .title{ font-weight:800 }
  .btn{ background:var(--accent); color:#002733; border:none; border-radius:10px; padding:10px 12px; cursor:pointer; font-weight:700 }
  .btn-ghost{ background:transparent; color:var(--text); border:1px solid var(--line) }
  main{ max-width:980px; margin:18px auto; padding:0 16px 40px }
  .card{ background:linear-gradient(180deg,var(--panel),var(--card)); border:1px solid var(--line); border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,.45); padding:14px; margin-bottom:12px }
  label{ display:block; margin:8px 0 6px; font-weight:600; color:#cfe8f6; font-size:13px }
  input[type="text"], input[type="number"], select, textarea{
    width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.06);
    background:linear-gradient(180deg,#0f2a3b,#0b2130); color:var(--text); outline:none;
  }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px } @media(max-width:720px){ .row{ grid-template-columns:1fr } }
  .row-3{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px } @media(max-width:720px){ .row-3{ grid-template-columns:1fr } }
  .actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; margin-top:12px }
  .hint{ color:var(--sub); font-size:12px }
  .ok{ color:var(--good); font-weight:700 } .err{ color:var(--bad) }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="title">Modifier — ${esc(s.nom)} ${esc(s.prenom)}</div>
    <div>
      <button class="btn" onclick="saveEditPage()">💾 Enregistrer</button>
      <button class="btn btn-ghost" onclick="window.close()">✖ Fermer</button>
    </div>
  </div>
</header>

<main>
  <section class="card">
    <div class="row">
      <div><label>Nom</label><input id="nom" type="text" value="${esc(s.nom)}"></div>
      <div><label>Prénom</label><input id="prenom" type="text" value="${esc(s.prenom)}"></div>
    </div>
    <div class="row">
      <div><label>Sexe</label>
        <select id="sexe">
          <option value="H"${s.sexe==='H'?' selected':''}>Homme</option>
          <option value="F"${s.sexe==='F'?' selected':''}>Femme</option>
        </select>
      </div>
      <div><label>Classe</label><input id="classe" type="text" value="${esc(s.classe||'')}"></div>
    </div>
    <label>Notes du professeur</label>
    <textarea id="notes" rows="4">${esc(s.notes||'')}</textarea>
  </section>

  <section class="card">
    <h3 style="margin:0 0 8px">Compétences (0–20)</h3>
    <div class="row-3">
      <div><label>Écriture</label><input id="ecriture" type="number" min="0" max="20" value="${Number(s.ecriture)||0}"></div>
      <div><label>Lecture</label><input id="lecture" type="number" min="0" max="20" value="${Number(s.lecture)||0}"></div>
      <div><label>Vocabulaire</label><input id="vocabulaire" type="number" min="0" max="20" value="${Number(s.vocabulaire)||0}"></div>
      <div><label>Grammaire</label><input id="grammaire" type="number" min="0" max="20" value="${Number(s.grammaire)||0}"></div>
      <div><label>Conjugaison</label><input id="conjugaison" type="number" min="0" max="20" value="${Number(s.conjugaison)||0}"></div>
      <div><label>Orthographe</label><input id="orthographe" type="number" min="0" max="20" value="${Number(s.orthographe)||0}"></div>
    </div>
  </section>

  <section class="card">
    <h3 style="margin:0 0 8px">Comportement (optionnel)</h3>
    <div class="row-3">
      <div><label>Score (sur 20)</label><input id="comportement" type="number" min="0" max="20" value="${s.comportement!=='' && s.comportement!==undefined ? Number(s.comportement)||0 : 0}"></div>
      <div><label>Détails</label><input id="comportement_details" type="text" value="${esc(s.comportement_details||'')}"></div>
      <div><label>Commentaire</label><input id="comportement_commentaire" type="text" value="${esc(s.comportement_commentaire||'')}"></div>
    </div>
    <div class="hint">Laissez les champs de comportement vides si vous ne les utilisez pas.</div>
  </section>

  <section class="actions">
    <button class="btn" onclick="saveEditPage()">💾 Enregistrer</button>
    <button class="btn btn-ghost" onclick="window.close()">✖ Fermer</button>
    <div id="status" class="hint"></div>
  </section>
</main>

<script>
  const API_BASE = ${JSON.stringify(API_BASE)};
  const MAX_SCORE = 20;
  const idx = ${Number(s.index)};

  const clamp = (v)=> Math.max(0, Math.min(MAX_SCORE, Number(v)||0));

  async function saveEditPage(){
    const status = document.getElementById('status');
    const btns = document.querySelectorAll('button');
    btns.forEach(b=>b.disabled=true);

    const payload = {
      action: 'update',
      index: idx,
      nom: document.getElementById('nom').value.trim(),
      prenom: document.getElementById('prenom').value.trim(),
      sexe: document.getElementById('sexe').value,
      classe: document.getElementById('classe').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      ecriture: clamp(document.getElementById('ecriture').value),
      lecture: clamp(document.getElementById('lecture').value),
      vocabulaire: clamp(document.getElementById('vocabulaire').value),
      grammaire: clamp(document.getElementById('grammaire').value),
      conjugaison: clamp(document.getElementById('conjugaison').value),
      orthographe: clamp(document.getElementById('orthographe').value),
      comportement: clamp(document.getElementById('comportement').value),
      comportement_details: document.getElementById('comportement_details').value.trim(),
      comportement_commentaire: document.getElementById('comportement_commentaire').value.trim(),
      date: new Date().toLocaleDateString()
    };

    // إذا كانت حقول comportement فارغة تمامًا، أرسل فراغ بدل 0 (اختياري)
    if(!payload.comportement_details && !payload.comportement_commentaire && Number(payload.comportement)===0){
      payload.comportement = '';
    }

    try{
      const url = API_BASE + '?' + new URLSearchParams(payload).toString();
      const res = await fetch(url, { method:'GET', cache:'no-store' });
      const ok = res.ok;
      let data = null;
      try{ data = await res.json(); }catch(_){}
      if(!ok || (data && data.ok===false)){
        throw new Error((data && data.error) || ('HTTP '+res.status));
      }
      status.innerHTML = '<span class="ok">✔ Enregistré</span>';
      // تحديث القائمة في النافذة الأصلية
      if(window.opener && window.opener.loadStudents){ try{ window.opener.loadStudents(); }catch(_){} }
      setTimeout(()=>window.close(), 600);
    }catch(e){
      status.innerHTML = '<span class="err">✖ Échec: '+ (e.message||e) +'</span>';
      btns.forEach(b=>b.disabled=false);
    }
  }
</script>
</body>
</html>`;
}

// فتح التبويب عبر Blob URL (طريقة آمنة)
function openModifier(idx){
  activeIdx = idx;
  const s = students[idx];
  if(!s){ alert('Élève introuvable'); return; }
  const html = buildEditHTML(s);
  try{
    const blob = new Blob([html], { type:'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open('', '_blank');
    if(!win){ alert('Fenêtre bloquée. Autorisez les popups.'); return; }
    setTimeout(()=>{ try{ win.location.href = url; }catch(_){ win.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); } }, 0);
    try{ win.addEventListener('beforeunload', ()=>{ try{ URL.revokeObjectURL(url); }catch(_){} }); }catch(_){}
  }catch(e){
    const w2 = window.open('data:text/html;charset=utf-8,' + encodeURIComponent(html), '_blank');
    if(!w2) alert('Fenêtre bloquée. Autorisez les popups.');
  }
}

// تحديث openModal: تقرير في تبويب جديد، وتعديل في تبويب تعديل مستقل
function openModal(arrIndex, editMode){
  if(!editMode){
    openReportFromList(arrIndex); // كما هو
  }else{
    openModifier(arrIndex);       // فتح صفحة التعديل الجديدة
  }
}
window.openModal = openModal;


function closeModal(){
  if(!modal) return;
  modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
  activeIdx = null;
  if(chartInstance){ chartInstance.destroy(); chartInstance = null; }
}

/* رسم داخل المودال */
function renderStudentChart(data){
  const ctx = qs('studentChart'); if(!ctx) return;
  if(chartInstance) chartInstance.destroy();
  try{
    chartInstance = new Chart(ctx, {
      type:'bar',
      data:{ labels: skillsLabels, datasets:[{ label:'Score /20', data: data.map(v=>Number(v)||0), backgroundColor:'rgba(0,180,216,0.75)', borderColor:'#00B4D8', borderWidth:1, borderRadius:8 }] },
      options:{ animation:{ duration:700, easing:'easeOutQuart' }, scales:{ y:{ beginAtZero:true, max:MAX_SCORE, ticks:{ stepSize:2 } } }, plugins:{ legend:{ display:false } } }
    });
  }catch(e){ console.warn('Chart error', e); }
}



/* ================== Edit mode ================== */
function toggleEditMode(enable){
  const notes = qs('modalNotes');
  const saveBtn = qs('saveEditBtn');
  const toggleBtn = qs('toggleEditBtn');

  if(enable){
    const tbody = document.querySelector('#skillsTable tbody');
    const s = students[activeIdx]; 
    if (tbody && s){
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
    const tbody = document.querySelector('#skillsTable tbody'); 
    if (tbody){
      tbody.innerHTML='';
      const arr = [s.ecriture,s.lecture,s.vocabulaire,s.grammaire,s.conjugaison,s.orthographe];
      arr.forEach((val,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${skillsLabels[i]}</td><td>${val ?? 0}</td>`; tbody.appendChild(tr); });
      if(qs('pedagoText')) qs('pedagoText').innerHTML = generatePedagoText(s);
      renderStudentChart(arr);
      if(qs('modalNotes')) qs('modalNotes').value = s.notes || '';
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
  s.notes = qs('modalNotes')?.value || '';
  s.date = new Date().toLocaleDateString();
  try{
    const r = await backend.update(s.index, s);
    if(r && r.ok===false){ throw new Error(r.error||'update failed'); }
    await loadStudents();
    toggleEditMode(false);
    renderList();
    if(qs('modalDate')) qs('modalDate').textContent = s.date;
    toast('Modifications enregistrées.');
  }catch(err){ alert('Échec de la sauvegarde.'); }
}

/* ================== Print / PDF ================== */
function printReport(){
  if(activeIdx===null){ alert("Ouvrez d'abord un élève."); return; }
  const s = students[activeIdx];
  openReportForStudent(s, { autoPrint:true, autoCloseAfter:false });
}
function downloadPDF(){
  if(activeIdx===null){ alert("Ouvrez d'abord un élève."); return; }
  const s = students[activeIdx];
  openReportForStudent(s, { autoPrint:true, autoCloseAfter:true });
}

/* ================== Comportement — صفحة مستقلة ================== */
const BH_WEIGHTS = {
  bavardage: -2,
  irrespect: -4,
  devoir: -2,
  retard: -1,
  oubli: -1,
  participation: +2,
  aide: +1
};

function buildBehavHTML(stu){
  const API = `${API_BASE}`;
  const detailsSafe = (stu.comportement_details||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const commentSafe = (stu.comportement_commentaire||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hasPrev = (stu.comportement!=='' && stu.comportement!==undefined);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Comportement — ${stu.nom} ${stu.prenom}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{ --bg:#0D1B2A; --panel:#101e2d; --card:#14273a; --line:#1b2f46; --text:#E0E1DD; --sub:#A9BCD0; --accent:#00B4D8; }
  *{box-sizing:border-box}
  body{ margin:0; font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:radial-gradient(700px 400px at 10% -10%,rgba(0,180,216,.06),transparent),var(--bg); color:var(--text) }
  header{ position:sticky; top:0; background:rgba(16,30,45,.92); border-bottom:1px solid var(--line); backdrop-filter:blur(6px) }
  .wrap{ max-width:960px; margin:0 auto; padding:14px 16px; display:flex; align-items:center; justify-content:space-between }
  .title{ font-weight:800 }
  main{ max-width:960px; margin:18px auto 32px; padding:0 16px }
  .card{ background:linear-gradient(180deg,var(--panel),var(--card)); border:1px solid var(--line); border-radius:14px; box-shadow:0 12px 30px rgba(0,0,0,.45); padding:14px }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
  label{ display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; background:#0e2132; border:1px solid var(--line) }
  input[type="number"], textarea{ width:100%; background:#0b2130; color:var(--text); border:1px solid var(--line); border-radius:10px; padding:8px }
  .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
  .btn{ background:var(--accent); color:#06202a; border:none; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer }
  .btn-ghost{ background:transparent; color:var(--text); border:1px solid var(--line) }
  .meta{ color:var(--sub); margin:6px 0 10px }
  .score{ font-size:28px; font-weight:900 }
  .hint{ font-size:12px; color:var(--sub) }
  .prev{ background:#0b2130; border:1px dashed var(--line); border-radius:10px; padding:10px; margin-top:10px; color:var(--sub) }
  @media (max-width:860px){ .grid{ grid-template-columns:1fr } }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="title">Évaluation du comportement — ${stu.nom} ${stu.prenom}</div>
    <div class="row">
      <button class="btn" onclick="save()">💾 Enregistrer</button>
      <button class="btn-ghost" onclick="window.close()">✖ Fermer</button>
    </div>
  </div>
</header>

<main>
  <div class="card">
    <div class="meta"><b>Classe:</b> ${stu.classe||'—'} &nbsp; | &nbsp; <b>Date:</b> <span id="dateNow"></span></div>
    <div class="grid">
      <div class="card" style="background:#0f2a3b">
        <h3>Infractions</h3>
        <label><input type="checkbox" id="bh_bavard"> Bavardage répété (-2)</label>
        <label><input type="checkbox" id="bh_irrespect"> Manque de respect (-4)</label>
        <label><input type="checkbox" id="bh_devoir"> Devoir non remis (-2)</label>
        <div class="row" style="margin-top:6px">
          <div>Retards (×1)</div><input type="number" id="bh_retard" min="0" value="0" style="width:90px">
          <div>Oubli matériel (×1)</div><input type="number" id="bh_oubli" min="0" value="0" style="width:90px">
        </div>
      </div>
      <div class="card" style="background:#0f2a3b">
        <h3>Points positifs</h3>
        <label><input type="checkbox" id="bh_participation"> Participation active (+2)</label>
        <label><input type="checkbox" id="bh_aide"> Aide aux camarades (+1)</label>
        <label style="margin-top:6px; background:transparent; border:none; padding:0; display:block">
          Commentaire
          <textarea id="bh_comment" placeholder="Observations..."></textarea>
        </label>
        <div style="margin-top:8px"><span class="hint">Score comportement</span><div class="score"><span id="bh_score">20</span>/20</div></div>
      </div>
    </div>

    ${hasPrev ? `<div class="prev"><b>Dernière saisie:</b> ${stu.comportement||'—'}/20 — <i>${detailsSafe||'—'}</i>${commentSafe?('<br><b>Commentaire:</b> '+commentSafe):''}</div>` : ''}

    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="save()">💾 Enregistrer</button>
      <button class="btn-ghost" onclick="window.close()">✖ Fermer</button>
      <span id="toast" class="hint" style="display:none; margin-left:6px"></span>
    </div>
  </div>
</main>

<script>
  const WEIGHTS = ${JSON.stringify(BH_WEIGHTS)};
  const student = ${JSON.stringify(stu)};
  const API_BASE_IN = ${JSON.stringify(API)};

  function nowDate(){ return new Date().toLocaleDateString(); }
  document.getElementById('dateNow').textContent = nowDate();

  // إعادة تعبئة من القيم السابقة
  (function preload(){
    const d = student.comportement_details || '';
    if (/Bavardage/i.test(d)) document.getElementById('bh_bavard').checked = true;
    if (/Manque de respect/i.test(d)) document.getElementById('bh_irrespect').checked = true;
    if (/Devoir non remis/i.test(d)) document.getElementById('bh_devoir').checked = true;
    const m1 = /Retards\\s*x(\\d+)/i.exec(d); if (m1) document.getElementById('bh_retard').value = Number(m1[1])||0;
    const m2 = /Oubli(?:\\s+matériel)?\\s*x(\\d+)/i.exec(d); if (m2) document.getElementById('bh_oubli').value = Number(m2[1])||0;
    if (/Participation active/i.test(d)) document.getElementById('bh_participation').checked = true;
    if (/Aide aux camarades/i.test(d))  document.getElementById('bh_aide').checked = true;
    document.getElementById('bh_comment').value = student.comportement_commentaire || '';
    // score سابق إن وُجد
    const s = Number(student.comportement);
    if (!isNaN(s)) document.getElementById('bh_score').textContent = Math.max(0, Math.min(20, s));
    recompute();
  })();

  function clamp20(x){ x = Number(x)||0; return Math.max(0, Math.min(20, x)); }

  function recompute(){
    let base = 20;
    const $ = (id)=>document.getElementById(id);

    if ($('bh_bavard').checked) base += WEIGHTS.bavardage;
    if ($('bh_irrespect').checked) base += WEIGHTS.irrespect;
    if ($('bh_devoir').checked) base += WEIGHTS.devoir;

    const retards = Math.max(0, Number($('bh_retard').value)||0);
    const oublis  = Math.max(0, Number($('bh_oubli').value)||0);
    base += retards * WEIGHTS.retard;
    base += oublis  * WEIGHTS.oubli;

    if ($('bh_participation').checked) base += WEIGHTS.participation;
    if ($('bh_aide').checked)          base += WEIGHTS.aide;

    base = clamp20(base);
    $('bh_score').textContent = base;
    return base;
  }

  ['bh_bavard','bh_irrespect','bh_devoir','bh_participation','bh_aide','bh_retard','bh_oubli','bh_comment']
    .forEach(id => document.getElementById(id).addEventListener('input', recompute));

  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.display='inline';
    clearTimeout(t._h); t._h = setTimeout(()=> t.style.display='none', 2200);
  }

  async function save(){
    const score = recompute();
    const details = [];
    if (document.getElementById('bh_bavard').checked) details.push('Bavardage');
    if (document.getElementById('bh_irrespect').checked) details.push('Manque de respect');
    if (document.getElementById('bh_devoir').checked) details.push('Devoir non remis');
    const retards = Math.max(0, Number(document.getElementById('bh_retard').value)||0);
    const oublis  = Math.max(0, Number(document.getElementById('bh_oubli').value)||0);
    if (retards>0) details.push('Retards x'+retards);
    if (oublis>0)  details.push('Oubli matériel x'+oublis);
    if (document.getElementById('bh_participation').checked) details.push('Participation active (+)');
    if (document.getElementById('bh_aide').checked)          details.push('Aide aux camarades (+)');

    const payload = {
      action:'update',
      index: student.index,
      nom: student.nom,
      prenom: student.prenom,
      sexe: student.sexe,
      classe: student.classe,
      notes: student.notes||'',
      ecriture: Number(student.ecriture)||0,
      lecture: Number(student.lecture)||0,
      vocabulaire: Number(student.vocabulaire)||0,
      grammaire: Number(student.grammaire)||0,
      conjugaison: Number(student.conjugaison)||0,
      orthographe: Number(student.orthographe)||0,
      comportement: score,
      comportement_details: details.join(', '),
      comportement_commentaire: (document.getElementById('bh_comment').value||'').trim(),
      date: nowDate()
    };

    const url = API_BASE_IN + '?' + new URLSearchParams(payload).toString();
    try{
      const res = await fetch(url, { method:'GET', cache:'no-store' });
      const ok = res.ok ? await res.json().catch(()=>({})) : null;
      if(!res.ok || (ok && ok.ok===false)) throw new Error('save failed');
      showToast('Comportement enregistré.');
      setTimeout(()=> window.close(), 700);
    }catch(e){
      alert('Échec de la sauvegarde. Vérifiez la connexion.');
    }
  }
</script>
</body>
</html>`;
}
// فتح صفحة السلوك في تبويب جديد باستخدام Blob URL لتفادي التبويب الفارغ
function openBehav(arrIndex){
  activeIdx = arrIndex;
  const s = students[arrIndex];
  if (!s) { alert('Élève introuvable'); return; }

  const html = buildBehavHTML(s);

  // طريقة آمنة: أنشئ Blob ثم افتح التبويب عبر object URL
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    // افتح التبويب أولًا (لتجنّب حظر النوافذ)، ثم غيّر موقعه إلى الـ URL
    const win = window.open('', '_blank');
    if (!win) { alert('Fenêtre bloquée. Autorisez les popups.'); return; }

    // في بعض المتصفحات يلزم setTimeout بسيط
    setTimeout(() => {
      try { win.location.href = url; } catch(_) {
        // fallback أخير: data URL
        try { win.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); } catch(e2) {}
      }
    }, 0);

    // تنظيف الـ URL عند إغلاق النافذة (إن أمكن)
    const revoke = () => { try { URL.revokeObjectURL(url); } catch(_) {} };
    // إن لم يدعم onbeforeunload للنافذة الجديدة نتجاهل
    try { win.addEventListener('beforeunload', revoke); } catch(_) { setTimeout(revoke, 5000); }

  } catch (err) {
    // fallback شامل: data URL مباشرة
    const fallbackWin = window.open('data:text/html;charset=utf-8,' + encodeURIComponent(html), '_blank');
    if (!fallbackWin) alert('Fenêtre bloquée. Autorisez les popups.');
  }
}
window.openBehav = openBehav;




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
      if(Object.prototype.hasOwnProperty.call(row, alias)){ foundVal = row[alias]; break; }
      const low = alias.toLowerCase();
      for(const k in row){ if(String(k).toLowerCase().trim()===low){ foundVal=row[k]; break; } }
      if(foundVal!=='') break;
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
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, {defval:''});
      importRows(json);
    }catch(err){ alert('Fichier invalide : '+err.message); }
  };
  reader.onerror = ()=> alert("Erreur de lecture du fichier");
  reader.readAsArrayBuffer(file);
}

/* ================== Events & Load ================== */
function attachEvents(){
  qs('btnAdd')?.addEventListener('click', addStudent);
  qs('btnClear')?.addEventListener('click', clearForm);
  qs('btnReset')?.addEventListener('click', resetFilters);
  qs('btnRefresh')?.addEventListener('click', loadStudents);
  qs('search')?.addEventListener('input', renderListDebounced);
  qs('filterClasse')?.addEventListener('change', renderList);
  qs('sortBy')?.addEventListener('change', renderList);
  qs('toggleEditBtn')?.addEventListener('click', ()=>toggleEditMode(true));
  qs('saveEditBtn')?.addEventListener('click', saveEdit);

  // Print / PDF
  qs('btnPrint')?.addEventListener('click', printReport);
  qs('btnPDF')?.addEventListener('click', downloadPDF);

  // Close modal
  qs('btnCloseModal2')?.addEventListener('click', closeModal);
  qs('btnCloseModal')?.addEventListener('click', closeModal);

  // Comportement
  qs('bh_save')?.addEventListener('click', saveBehav);
  qs('bh_cancel')?.addEventListener('click', closeBehav);
  qs('behavClose')?.addEventListener('click', closeBehav);

  // Import Excel/CSV
  qs('btnImport')?.addEventListener('click', ()=> qs('excelInput').click());
  qs('excelInput')?.addEventListener('change', (e)=>{
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
    console.error(err);
    alert("Impossible de charger les données. Vérifiez رابط الويب وصلاحيات الوصول.");
  }finally{
    setLoading(btn, false);
  }
}
function init(){ attachEvents(); loadStudents(); }
init();

/* ================== Expose to window for inline onclick ================== */
window.openModal = openModal;
window.openReportFromList = openReportFromList;
window.openBehav = openBehav;
window.deleteStudent = deleteStudent;
window.saveEdit = saveEdit;
window.printReport = printReport;
window.downloadPDF = downloadPDF;

