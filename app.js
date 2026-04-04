// ── BENCHMARKS ───────────────────────────────────────────────────────
const BM={
  hospitality:  {gross:.25,net:.055,label:'Hospitality / Food & Drink',stockDays:14,debtDays:21},
  retail:       {gross:.35,net:.04, label:'Retail — Physical',         stockDays:45,debtDays:30},
  ecommerce:    {gross:.40,net:.085,label:'Retail — E-commerce',       stockDays:30,debtDays:14},
  construction: {gross:.20,net:.06, label:'Construction',              stockDays:60,debtDays:45},
  professional: {gross:.60,net:.20, label:'Professional Services',     stockDays:null,debtDays:30},
  it:           {gross:.65,net:.17, label:'IT / Technology',           stockDays:null,debtDays:30},
  health:       {gross:.50,net:.115,label:'Health & Beauty',           stockDays:30,debtDays:21},
  manufacturing:{gross:.325,net:.07,label:'Manufacturing',             stockDays:60,debtDays:45},
  transport:    {gross:.20,net:.05, label:'Transport & Logistics',     stockDays:null,debtDays:30},
  education:    {gross:.525,net:.15,label:'Education / Training',      stockDays:null,debtDays:30},
  finance:      {gross:.70,net:.275,label:'Financial Services',        stockDays:null,debtDays:21},
  other:        {gross:.375,net:.088,label:'Other / Mixed',            stockDays:45,debtDays:30},
};

// ── HELPERS ──────────────────────────────────────────────────────────
const v=id=>parseFloat(document.getElementById(id)?.value)||0;
document.addEventListener('input', e => {
  if(e.target.matches('input[type=number]')) clearFieldError(e.target.id);
});
const fm=n=>'£'+Math.round(Math.abs(n)).toLocaleString('en-GB');
const fp=n=>(n*100).toFixed(1)+'%';
const fmSign=n=>(n<0?'-£':'£')+Math.round(Math.abs(n)).toLocaleString('en-GB');

const statusIconMap={green:'fa-circle-check',amber:'fa-circle-exclamation',red:'fa-circle-xmark'};

function statusBadgeHTML(state,label){
  return `<i class="fas ${statusIconMap[state]||'fa-circle'}"></i><span>${label}</span>`;
}

function checklistLeadHTML(tone){
  return `<span class="ck-lead ${tone}"><i class="fas ${statusIconMap[tone]||'fa-circle'}"></i></span>`;
}

function syncMoreFieldsHeight(){
  const wrap=document.getElementById('moreFields');
  if(!wrap || !wrap.classList.contains('open')) return;
  const height=wrap.scrollHeight + 24;
  wrap.style.setProperty('--more-open-height', height + 'px');
}

function tip(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.classList.toggle('show');
  requestAnimationFrame(syncMoreFieldsHeight);
  window.setTimeout(syncMoreFieldsHeight, 220);
}

const RESULTS_STORAGE_KEY='fintori_results_html';
const FORM_STORAGE_KEY='fintori_form_state';

function saveResultsSnapshot(){
  const results=document.getElementById('results');
  if(!results || !results.innerHTML.trim()) return;
  localStorage.setItem(RESULTS_STORAGE_KEY, results.innerHTML);
}

function restoreResultsSnapshot(){
  const results=document.getElementById('results');
  const saved=localStorage.getItem(RESULTS_STORAGE_KEY);
  if(!results || !saved) return false;
  results.innerHTML=saved;
  return true;
}

function getPersistedFields(){
  return [...document.querySelectorAll('#s1 input, #s1 select, #s2 input, #s2 select, #s3 input, #s3 select')]
    .filter(el => el.id);
}

function saveFormState(){
  const state = {};
  getPersistedFields().forEach(el => {
    state[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
}

function restoreFormState(){
  const raw = localStorage.getItem(FORM_STORAGE_KEY);
  if(!raw) return false;
  try{
    const state = JSON.parse(raw);
    getPersistedFields().forEach(el => {
      if(!(el.id in state)) return;
      if(el.type === 'checkbox'){
        el.checked = !!state[el.id];
      } else {
        el.value = state[el.id];
      }
    });
    return true;
  } catch {
    return false;
  }
}

function computeUnlockedStep(){
  let nextUnlocked = 1;
  if(validateStep(1)) nextUnlocked = 2;
  if(validateStep(1) && validateStep(2)) nextUnlocked = 3;
  if(validateStep(1) && validateStep(2) && validateStep(3)) {
    nextUnlocked = localStorage.getItem(RESULTS_STORAGE_KEY) ? 4 : 3;
  }
  unlockedStep = nextUnlocked;
  syncNavLockState();
}

function setStepUrl(step){
  const url = new URL(window.location.href);
  url.searchParams.set('step', String(step));
  history.replaceState(null, '', url.toString());
}

function getStepFromUrl(){
  const url = new URL(window.location.href);
  const step = parseInt(url.searchParams.get('step') || '1', 10);
  return Number.isFinite(step) ? step : 1;
}

function bindFormPersistence(){
  getPersistedFields().forEach(el => {
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      saveFormState();
      computeUnlockedStep();
    });
  });
}

function recalc(){
  const d=document.getElementById('vatReg').checked?1.2:1;
  ['1','2','3'].forEach(i=>{
    document.getElementById('rn'+i).textContent=fm(v('r'+i)/d);
  });
}

let currentStep = 1;
let unlockedStep = 1;

function hasValue(id){
  const el=document.getElementById(id);
  return !!el && el.value.trim()!=='';
}



const FIELD_MONETARY = ['r1','r2','r3','cogs','dlab','rent','wages','nic','loan',
                        'util','ins','mkt','prof','sw','other',
                        'cash','debtors','creditors','debt','stock'];

function validateField(id){
  const el = document.getElementById(id);
  if(!el) return null;
  const raw = el.value.trim();
  if(raw === '') return 'This field is required.';
  const n = parseFloat(raw);
  if(isNaN(n)) return 'Please enter a valid number.';
  if(FIELD_MONETARY.includes(id)){
    if(n < 0)        return 'Value cannot be negative.';
    if(n > 10000000) return 'Maximum value is £10,000,000.';
  }
  if(['r1','r2','r3'].includes(id) && n <= 0)
    return 'Revenue must be greater than zero.';
  if(id==='emp'){
    if(n<0 || Math.floor(n)!==n) return 'Enter a whole number of 0 or more.';
    if(n>9999)                   return 'Maximum is 9,999 employees.';
  }
  return null;
}

function showFieldError(id, message){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('field-error');
  // Insert tip AFTER .inp-wrap (its parent), not inside it —
  // so the £ prefix position (top:50%) is never affected.
  const wrap = el.closest('.inp-wrap');
  const anchor = wrap || el.parentElement;
  const container = anchor.parentElement;
  if(container.querySelector('.field-error-tip')) return;
  const tip = document.createElement('span');
  tip.className = 'field-error-tip';
  tip.textContent = message;
  anchor.insertAdjacentElement('afterend', tip);
}

function clearFieldError(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('field-error');
  const wrap = el.closest('.inp-wrap');
  const anchor = wrap || el.parentElement;
  anchor.parentElement?.querySelector('.field-error-tip')?.remove();
}

function validateFieldsForStep(step){
  const fields = {
    1: ['r1','r2','r3'],
    2: ['cogs','dlab','rent','wages','nic','loan'],
    3: ['cash','debtors','creditors','debt','stock','emp']
  }[step] || [];
  let ok = true;
  fields.forEach(id => {
    const err = validateField(id);
    if(err){ showFieldError(id, err); ok = false; }
    else   { clearFieldError(id); }
  });
  return ok;
}

function validateStep(step){
  if(step===1) return ['r1','r2','r3'].every(hasValue);
  if(step===2) return ['cogs','dlab','rent','wages','nic','loan'].every(hasValue);
  if(step===3) return ['cash','debtors','creditors','debt','stock','emp'].every(hasValue);
  return true;
}

function showStepError(step){
  const message={
    1:'Enter all three revenue months before continuing.',
    2:'Complete the core cost fields before continuing.',
    3:'Complete the business details before generating results.'
  }[step] || 'Complete this step before continuing.';
  showToast(message);
}

function clearStepError(step){
  return step;
}

function getToastStack(){
  let stack=document.querySelector('.toast-stack');
  if(!stack){
    stack=document.createElement('div');
    stack.className='toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message){
  const stack=getToastStack();
  const toast=document.createElement('div');
  toast.className='step-toast';
  toast.innerHTML='<span class="step-toast-icon"><i class="fas fa-xmark"></i></span><div class="step-toast-text">'+message+'</div>';
  stack.appendChild(toast);

  window.clearTimeout(showToast.dismissTimer);
  showToast.dismissTimer=window.setTimeout(()=>{
    toast.classList.add('fade-out');
    window.setTimeout(()=>{
      toast.remove();
      if(!stack.children.length) stack.remove();
    }, 240);
  }, 3200);
}

function syncNavLockState(){
  [1,2,3,4].forEach(i=>{
    const btn=document.getElementById('sb'+i);
    if(!btn) return;
    btn.disabled=i>unlockedStep;
    btn.classList.toggle('locked', i>unlockedStep);
  });
}

function requestStep(n){
  if(n<=unlockedStep){
    clearStepError(currentStep);
    goTo(n);
    return;
  }
  showStepError(currentStep);
}

function advanceStep(step){
  // First run per-field validation to show inline errors
  const fieldsOk=validateFieldsForStep(step);
  if(!validateStep(step)||!fieldsOk){
    showStepError(step);
    return;
  }
  clearStepError(step);
  unlockedStep=Math.max(unlockedStep, step+1);
  syncNavLockState();
  goTo(step+1);
}

// ── NAVIGATION ───────────────────────────────────────────────────────
function goTo(n){
  currentStep=n;
  [1,2,3].forEach(i=>{
    const s=document.getElementById('s'+i);
    if(s) s.classList.toggle('active',i===n);
    const b=document.getElementById('sb'+i);
    b.classList.toggle('active',i===n);
    if(i<n) b.classList.add('done'); else if(i>n) b.classList.remove('done');
  });
  const results=document.getElementById('results');
  if(n===4){
    if(restoreResultsSnapshot()){
      initAppChrome();
      results.style.display='grid';
      requestAnimationFrame(()=>{
        results.classList.add('is-open');
      });
    }
  } else {
    results.style.display='none';
    results.classList.remove('is-open');
  }
  document.getElementById('loading').style.display='none';
  const pct=[20,50,80,100];
  document.getElementById('prog').style.width=pct[n-1]+'%';
  document.getElementById('sb4').classList.toggle('active',n===4);
  setStepUrl(n);
  window.scrollTo({top:0,behavior:'smooth'});
}

// ── CALCULATE ────────────────────────────────────────────────────────
function calc(){
  const d=document.getElementById('vatReg').checked?1.2:1;
  const r1=v('r1')/d, r2=v('r2')/d, r3=v('r3')/d;
  const totRev=r1+r2+r3, avgRev=totRev/3;

  const cogsM=v('cogs')+v('dlab');
  const opexM=v('rent')+v('wages')+v('nic')+v('loan')+v('util')+v('ins')+v('mkt')+v('prof')+v('sw')+v('other');
  const totalCostsM=cogsM+opexM;
  const totProfit=totRev-(totalCostsM*3);
  const netMgn=totRev>0?totProfit/totRev:0;
  const grossProfit=avgRev-cogsM;
  const grossMgn=avgRev>0?grossProfit/avgRev:0;

  // EBITDA (proxy: net profit + loan repayments, since we don't have D&A separately)
  const ebitdaM=(totProfit/3)+v('loan');

  // Breakeven: Fixed costs / Gross Margin %
  const fixedM=opexM;
  const breakeven=grossMgn>0?fixedM/grossMgn:null;
  const breakevenGap=avgRev>0&&breakeven!==null?avgRev-breakeven:null;

  const cash=v('cash'), debt=v('debt'), debtors=v('debtors'), creditors=v('creditors');
  const stock=v('stock'), emp=v('emp');

  const runway=totalCostsM>0?cash/totalCostsM:null;
  const debtRatio=avgRev>0?debt/avgRev:0;
  const revGrowth=r1>0?(r2-r1)/r1:0;

  const debtorDays=totRev>0&&debtors>0?(debtors/(totRev/3*12/365)):null;
  const creditorDays=cogsM>0&&creditors>0?(creditors/(cogsM*12/365)):null;
  const stockDays=stock>0&&cogsM>0?(stock/(cogsM*12/365)):null;
  const revPerEmp=emp>0?(avgRev*12/emp):null;
  const wcr=(creditors+debt)>0?(cash+debtors)/(creditors+debt):null;
  const workingCapital=cash+debtors-creditors-debt;

  const sector=document.getElementById('sector').value;
  const bench=BM[sector]||BM.other;

  const costMap=[
    {n:'Rent & Rates',    a:v('rent')},
    {n:'Staff Wages',     a:v('wages')},
    {n:'Employer NIC',    a:v('nic')},
    {n:'Materials/Stock', a:v('cogs')},
    {n:'Direct Labour',   a:v('dlab')},
    {n:'Utilities',       a:v('util')},
    {n:'Insurance',       a:v('ins')},
    {n:'Marketing',       a:v('mkt')},
    {n:'Professional',    a:v('prof')},
    {n:'Software',        a:v('sw')},
    {n:'Loan Repayments', a:v('loan')},
    {n:'Other',           a:v('other')},
  ].filter(c=>c.a>0).sort((a,b)=>b.a-a.a);

  return {r1,r2,r3,totRev,avgRev,totProfit,netMgn,grossMgn,ebitdaM,
    breakeven,breakevenGap,cash,debt,debtors,creditors,stock,emp,
    runway,debtRatio,revGrowth,debtorDays,creditorDays,stockDays,
    revPerEmp,wcr,workingCapital,totalCostsM,fixedM,cogsM,opexM,
    sector,bench,costMap};
}

// ── RENDER ───────────────────────────────────────────────────────────
function generateResults(){
  if(!validateStep(3)){
    showStepError(3);
    return;
  }
  const fieldsOk = validateFieldsForStep(3);
  if(!fieldsOk){
    showStepError(3);
    return;
  }
  saveFormState();
  clearStepError(3);
  unlockedStep=4;
  syncNavLockState();
  document.getElementById('s3').classList.remove('active');
  document.getElementById('loading').style.display='block';
  document.getElementById('prog').style.width='100%';
  ['sb1','sb2','sb3'].forEach(id=>{
    document.getElementById(id).classList.add('done');
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById('sb4').classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>{ document.getElementById('loading').style.display='none'; render(); },1200);
}

function render(){
  const d=calc();

  // ── VERDICT ──
  const redCount=[
    d.netMgn<0,
    d.grossMgn<0.15,
    d.runway!==null&&d.runway<1,
    d.wcr!==null&&d.wcr<1,
    d.debtRatio>6,
  ].filter(Boolean).length;
  const amberCount=[
    d.netMgn>=0&&d.netMgn<0.05,
    d.runway!==null&&d.runway>=1&&d.runway<3,
    d.debtorDays!==null&&d.debtorDays>60,
  ].filter(Boolean).length;

  const verd=document.getElementById('verdict');
  verd.className='verdict '+(redCount>=2?'bad':amberCount>=2||redCount===1?'warn':'good');
  document.getElementById('vicon').innerHTML=redCount>=2?'<i class="fas fa-triangle-exclamation"></i>':amberCount>=2||redCount===1?'<i class="fas fa-clipboard-list"></i>':'<i class="fas fa-circle-check"></i>';
  document.getElementById('vtitle').textContent=
    redCount>=2?'Immediate action needed':
    amberCount>=2||redCount===1?'A few areas need attention':
    'Business looks healthy';
  document.getElementById('vbody').textContent=
    redCount>=2?'Your business has '+redCount+' critical indicators. Focus on the red actions below before anything else.':
    amberCount>=2||redCount===1?'Most metrics are acceptable but '+(redCount+amberCount)+' area'+(redCount+amberCount>1?'s need':' needs')+' attention. See recommended actions below.':
    'Your key metrics are within healthy ranges. Keep monitoring monthly and use the growth actions below to push further.';

  // ── KPIs ──
  document.getElementById('k_rev').textContent=fm(d.totRev);
  const profEl=document.getElementById('k_profit');
  profEl.textContent=fmSign(d.totProfit);
  profEl.className='kpi-val'+(d.totProfit<0?' neg':'');
  document.getElementById('k_margin').textContent=fp(d.netMgn);
  document.getElementById('k_ebitda').textContent=fmSign(d.ebitdaM)+'/mo';
  document.getElementById('k_runway').textContent=d.runway!==null?d.runway.toFixed(1)+' mo':'—';
  document.getElementById('k_be').textContent=d.breakeven!==null?fm(d.breakeven)+'/mo':'—';

  // ── BREAKEVEN ──
  const breakevenCard=document.getElementById('resultBreakeven');
  if(d.breakeven!==null){
    breakevenCard.classList.remove('is-empty');
    document.getElementById('be_val').textContent=fm(d.breakeven);
    document.getElementById('be_sub').textContent='The minimum monthly revenue to cover all costs';
    const gap=d.breakevenGap;
    const pct=d.avgRev>0?(d.avgRev/d.breakeven*100).toFixed(0):0;
    document.getElementById('be_detail').innerHTML=
      '<strong>Current avg monthly revenue:</strong> '+fm(d.avgRev)+'<br>'+
      '<strong>Breakeven:</strong> '+fm(d.breakeven)+'<br>'+
      '<strong>You are at '+pct+'% of breakeven</strong><br><br>'+
      (gap>0
        ? '<span class="inline-status good"><i class="fas fa-circle-check"></i><span>You are <strong>'+fm(gap)+' above breakeven</strong> per month. That is your safety buffer.</span></span>'
        : '<span class="inline-status bad"><i class="fas fa-circle-xmark"></i><span>You are <strong>'+fm(Math.abs(gap))+' below breakeven</strong> per month. Every month you lose this amount.</span></span>');
  } else {
    breakevenCard.classList.add('is-empty');
    document.getElementById('be_val').textContent='Needs margin data';
    document.getElementById('be_sub').textContent='Add revenue and direct costs to calculate a useful breakeven figure';
    document.getElementById('be_detail').textContent='Breakeven only becomes meaningful once the report can see a positive gross margin.';
  }

  // ── TRAFFIC LIGHTS ──
  const tlProfit=[
    {m:'Gross Margin',     val:fp(d.grossMgn),   s:d.grossMgn>=.35?'green':d.grossMgn>=.2?'amber':'red',  l:d.grossMgn>=.35?'Strong':d.grossMgn>=.2?'Moderate':'Low',
     aiCtx:{metric:'Gross Margin',value:fp(d.grossMgn),status:d.grossMgn>=.35?'good':d.grossMgn>=.2?'moderate':'bad',avgRev:Math.round(d.avgRev),cogsM:Math.round(d.cogsM),sector:d.bench.label,benchmark:fp(d.bench.gross)}},
    {m:'Net Margin (avg)', val:fp(d.netMgn),     s:d.netMgn>=.1?'green':d.netMgn>=.05?'amber':'red',      l:d.netMgn>=.1?'Healthy':d.netMgn>=.05?'Below avg':'Critical',
     aiCtx:{metric:'Net Margin',value:fp(d.netMgn),status:d.netMgn>=.1?'good':d.netMgn>=.05?'moderate':'bad',avgRev:Math.round(d.avgRev),totalCostsM:Math.round(d.totalCostsM),topCosts:d.costMap.slice(0,3).map(c=>c.n+' £'+Math.round(c.a)),sector:d.bench.label,benchmark:fp(d.bench.net)}},
    {m:'EBITDA',           val:fmSign(d.ebitdaM)+'/mo', s:d.ebitdaM>0?'green':d.ebitdaM===0?'amber':'red', l:d.ebitdaM>0?'Positive':d.ebitdaM===0?'Break-even':'Negative',
     aiCtx:{metric:'EBITDA',value:fmSign(d.ebitdaM)+'/mo',status:d.ebitdaM>0?'good':d.ebitdaM===0?'moderate':'bad',ebitda:Math.round(d.ebitdaM),loanRepayments:Math.round(v('loan')),netProfit:Math.round(d.totProfit/3)}},
    {m:'Revenue Trend',    val:(d.revGrowth>=0?'+':'')+fp(d.revGrowth), s:d.revGrowth>0?'green':d.revGrowth===0?'amber':'red', l:d.revGrowth>0?'Growing':d.revGrowth===0?'Flat':'Declining',
     aiCtx:{metric:'Revenue Trend',value:(d.revGrowth>=0?'+':'')+fp(d.revGrowth),status:d.revGrowth>0?'good':d.revGrowth===0?'moderate':'bad',m1:Math.round(d.r1),m2:Math.round(d.r2),m3:Math.round(d.r3)}},
  ];
  const tlCash=[
    {m:'Cash Runway',       val:d.runway!==null?d.runway.toFixed(1)+' months':'—', s:d.runway===null?'green':d.runway>=3?'green':d.runway>=1?'amber':'red', l:d.runway===null?'No cost data':d.runway>=3?'Good':d.runway>=1?'Tight':'Danger',
     aiCtx:{metric:'Cash Runway',value:d.runway!==null?d.runway.toFixed(1)+' months':'N/A',status:d.runway===null?'good':d.runway>=3?'good':d.runway>=1?'moderate':'bad',cash:Math.round(d.cash),avgMonthlyCosts:Math.round(d.totalCostsM),avgRev:Math.round(d.avgRev)}},
    {m:'Working Capital',   val:d.wcr!==null?d.wcr.toFixed(2)+'x':'—',       s:d.wcr===null?'green':d.wcr>=1.5?'green':d.wcr>=1?'amber':'red', l:d.wcr===null?'Not enough data':d.wcr>=1.5?'Healthy':d.wcr>=1?'Tight':'Danger',
     aiCtx:{metric:'Working Capital',value:d.wcr!==null?d.wcr.toFixed(2)+'x':'N/A',status:d.wcr===null?'good':d.wcr>=1.5?'good':d.wcr>=1?'moderate':'bad',cash:Math.round(d.cash),debtors:Math.round(d.debtors),creditors:Math.round(d.creditors),debt:Math.round(d.debt),workingCapital:Math.round(d.workingCapital)}},
    {m:'Debt / Revenue',    val:d.avgRev>0?d.debtRatio.toFixed(1)+'x':'—',   s:d.debtRatio<=3?'green':d.debtRatio<=6?'amber':'red', l:d.debtRatio<=3?'Manageable':d.debtRatio<=6?'Monitor':'High',
     aiCtx:{metric:'Debt to Revenue',value:d.avgRev>0?d.debtRatio.toFixed(1)+'x':'N/A',status:d.debtRatio<=3?'good':d.debtRatio<=6?'moderate':'bad',debt:Math.round(d.debt),avgRev:Math.round(d.avgRev),loanRepayments:Math.round(v('loan'))}},
  ];
  const tlEff=[];
  if(d.debtorDays!==null&&d.debtors>0){
    const dd=Math.round(d.debtorDays), bdd=d.bench.debtDays;
    tlEff.push({m:'Debtor Days',val:dd+' days (target '+bdd+'d)',s:dd<=bdd?'green':dd<=bdd*2?'amber':'red',l:dd<=bdd?'On target':dd<=bdd*2?'Slow':'Too slow',
      aiCtx:{metric:'Debtor Days',value:dd+' days',status:dd<=bdd?'good':dd<=bdd*2?'moderate':'bad',debtors:Math.round(d.debtors),avgMonthlyRev:Math.round(d.avgRev),debtorDays:dd,benchmarkDays:bdd,sector:d.bench.label}});
  }
  if(d.creditorDays!==null&&d.creditors>0){
    const cd=Math.round(d.creditorDays);
    tlEff.push({m:'Creditor Days',val:cd+' days',s:cd<=60?'green':cd<=90?'amber':'red',l:cd<=60?'Good':cd<=90?'Getting long':'Risk of disputes',
      aiCtx:{metric:'Creditor Days',value:cd+' days',status:cd<=60?'good':cd<=90?'moderate':'bad',creditors:Math.round(d.creditors),creditorDays:cd}});
  }
  if(d.stockDays!==null&&d.bench.stockDays){
    const sd=Math.round(d.stockDays), bsd=d.bench.stockDays;
    tlEff.push({m:'Stock Turnover',val:sd+' days (target '+bsd+'d)',s:sd<=bsd?'green':sd<=bsd*2?'amber':'red',l:sd<=bsd?'Good':sd<=bsd*2?'Monitor':'Slow',
      aiCtx:{metric:'Stock Turnover',value:sd+' days',status:sd<=bsd?'good':sd<=bsd*2?'moderate':'bad',stock:Math.round(d.stock),stockDays:sd,benchmarkDays:bsd,cogsM:Math.round(d.cogsM)}});
  }
  if(d.emp===0){
    tlEff.push({m:'Revenue / Employee',val:'Solo business — no employees',s:'green',l:'Solo',
      aiCtx:{metric:'Revenue per Employee',value:'Solo business',status:'good',employees:0,annualRev:Math.round(d.avgRev*12)}});
  } else if(d.revPerEmp!==null&&d.emp>0){
    const rpe=Math.round(d.revPerEmp);
    tlEff.push({m:'Revenue / Employee',val:'£'+rpe.toLocaleString('en-GB')+'/yr',s:rpe>=80000?'green':rpe>=40000?'amber':'red',l:rpe>=80000?'Strong':rpe>=40000?'Average':'Low',
      aiCtx:{metric:'Revenue per Employee',value:'£'+rpe.toLocaleString('en-GB')+'/yr',status:rpe>=80000?'good':rpe>=40000?'moderate':'bad',revPerEmp:rpe,employees:d.emp,annualRev:Math.round(d.avgRev*12),totalWages:Math.round((v('wages')+v('dlab'))*12)}});
  }

  const tlHTML=(items,ctx)=>items.map((t,i)=>{
    const uid='ai_'+ctx+'_'+i;
    const ctxData = JSON.stringify(t.aiCtx||{});
    return `
    <div>
      <div class="tl-item">
        <div class="tl-left">
          <div class="tl-metric" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            ${t.m}
            
          </div>
          <div class="tl-value">${t.val}</div>
        </div>
        <div class="tl-badge tl-${t.s}">${statusBadgeHTML(t.s, t.l)}</div>
      </div>
      <div class="ai-panel" id="panel_${uid}">
        <div class="ai-panel-inner">
          <div class="ai-avatar"><i class="fas fa-wand-magic-sparkles"></i></div>
          <div class="ai-content">
            <div class="ai-label">AI Analysis · ${t.m}</div>
            <div id="body_${uid}">
              <div class="ai-spinner"><div class="ai-spinner-dot"></div><div class="ai-spinner-dot"></div><div class="ai-spinner-dot"></div><span style="margin-left:4px;font-size:12px;color:var(--g400)">Thinking...</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`}).join('');

  document.getElementById('tl_profit').innerHTML=tlHTML(tlProfit,'profit');
  document.getElementById('tl_cash').innerHTML=tlHTML(tlCash,'cash');
  document.getElementById('tl_eff').innerHTML=tlEff.length?tlHTML(tlEff,'eff'):'<div style="padding:12px 16px;font-size:13px;color:var(--g400)">Enter debtors, creditors, stock and employees for efficiency metrics.</div>';

  // ── BENCHMARKS ──
  const MAX=80;
  const yg=Math.min(d.grossMgn*100,MAX), ug=Math.min(d.bench.gross*100,MAX);
  const yn=Math.min(Math.max(d.netMgn*100,0),MAX), un=Math.min(d.bench.net*100,MAX);
  document.getElementById('bench').innerHTML=`
    <div class="bench-item">
      <div class="bench-hdr"><span class="bench-name">Gross Margin</span><span class="bench-vals">You: ${fp(d.grossMgn)} &nbsp;|&nbsp; UK avg: ${fp(d.bench.gross)}</span></div>
      <div class="bar-track"><div class="bar-you ${d.grossMgn>=d.bench.gross?'bar-pos':'bar-neg'}" style="width:${yg/MAX*100}%"></div><div class="bar-marker" style="left:${ug/MAX*100}%"></div></div>
    </div>
    <div class="bench-item">
      <div class="bench-hdr"><span class="bench-name">Net Margin</span><span class="bench-vals">You: ${fp(d.netMgn)} &nbsp;|&nbsp; UK avg: ${fp(d.bench.net)}</span></div>
      <div class="bar-track"><div class="bar-you ${d.netMgn>=d.bench.net?'bar-pos':'bar-neg'}" style="width:${yn/MAX*100}%"></div><div class="bar-marker" style="left:${un/MAX*100}%"></div></div>
    </div>
    <div class="bar-legend"><div class="leg"><div class="leg-dot" style="background:var(--blue)"></div>Your figure</div><div class="leg"><div class="leg-dot" style="background:var(--g400)"></div>UK ${d.bench.label} avg · ONS 2024/25</div></div>`;

  // ── COSTS ──
  const totC=d.costMap.reduce((s,c)=>s+c.a,0);
  document.getElementById('costs').innerHTML=d.costMap.length&&totC>0
    ?d.costMap.map(c=>`
      <div class="cost-item">
        <div class="cost-hdr"><span class="cost-name">${c.n}</span><span class="cost-val">${fm(c.a)}/mo &nbsp;<span style="color:var(--g400);font-weight:400">${fp(c.a/totC)}</span></span></div>
        <div class="cost-track"><div class="cost-fill" style="width:${c.a/totC*100}%"></div></div>
      </div>`).join('')
    :'<p style="font-size:13px;color:var(--g400);text-align:center;padding:8px 0">No cost data entered</p>';

  // VAT
  document.getElementById('vatWarn').style.display=d.totRev>=67500?'block':'none';

  // ── ACTIONS ──
  const acts=[];
  if(d.netMgn<0)           acts.push({p:'red',  t:'<strong>Net loss recorded.</strong> Your costs exceed revenue. Review every expense line this week — start with your largest cost.'});
  if(d.netMgn>=0&&d.netMgn<.05) acts.push({p:'red',t:'<strong>Net margin below 5%.</strong> Review your top 3 cost lines immediately — target a 10% reduction on each.'});
  if(d.grossMgn<.15)       acts.push({p:'red',  t:'<strong>Gross margin critically low.</strong> Review your pricing — even a 5% price increase can dramatically improve this.'});
  if(d.breakeven!==null&&d.breakevenGap<0) acts.push({p:'red',t:'<strong>Below breakeven by '+fm(Math.abs(d.breakevenGap))+'/month.</strong> You need to either increase revenue or cut fixed costs urgently.'});
  if(d.runway!==null&&d.runway<1) acts.push({p:'red',t:'<strong>Less than 1 month cash.</strong> Contact your bank about an overdraft or emergency business loan today.'});
  if(d.wcr!==null&&d.wcr<1) acts.push({p:'red', t:'<strong>Working Capital Ratio below 1.0x.</strong> You may struggle to pay short-term obligations. Speak to your bank about a working capital facility.'});
  if(d.debtorDays!==null&&d.debtorDays>60) acts.push({p:'red',t:'<strong>Debtor days '+Math.round(d.debtorDays)+'d — dangerously slow.</strong> Chase all overdue invoices. Consider a 2% early payment discount or invoice factoring.'});
  if(d.runway!==null&&d.runway>=1&&d.runway<3) acts.push({p:'amber',t:'<strong>Cash runway under 3 months.</strong> Cut non-essential spending and chase all outstanding invoices this week.'});
  if(d.revGrowth<0)         acts.push({p:'amber',t:'<strong>Revenue declined month-on-month.</strong> Contact your top 5 customers this week — focus on retention.'});
  if(d.debtRatio>6)         acts.push({p:'amber',t:'<strong>Debt level is high ('+d.debtRatio.toFixed(1)+'x monthly revenue).</strong> Speak to a financial adviser about refinancing or a repayment plan.'});
  if(d.debtorDays!==null&&d.debtorDays>30&&d.debtorDays<=60) acts.push({p:'amber',t:'<strong>Debtor days '+Math.round(d.debtorDays)+'d.</strong> Target for your sector is '+d.bench.debtDays+'d. Send payment reminders 7 days before and on the due date.'});
  if(d.stockDays!==null&&d.bench.stockDays&&d.stockDays>d.bench.stockDays*2) acts.push({p:'amber',t:'<strong>Stock turnover slow ('+Math.round(d.stockDays)+'d).</strong> £'+Math.round(d.stock).toLocaleString('en-GB')+' is tied up in inventory. Identify slow-moving lines and clear them.'});
  if(d.totRev>=67500)       acts.push({p:'amber',t:'<strong>Approaching VAT threshold.</strong> Register with HMRC — mandatory within 30 days of exceeding £90,000/yr.'});
  if(d.netMgn>=.1)          acts.push({p:'green',t:'<strong>Net margin is healthy.</strong> Consider reinvesting profits into marketing or staff training.'});
  if(d.grossMgn>=d.bench.gross) acts.push({p:'green',t:'<strong>Gross margin beats sector average</strong> ('+fp(d.bench.gross)+') — protect this by reviewing supplier costs quarterly.'});
  if(d.revPerEmp!==null&&d.revPerEmp<40000) acts.push({p:'amber',t:'<strong>Revenue per employee low (£'+Math.round(d.revPerEmp).toLocaleString('en-GB')+'/yr).</strong> UK SME target: £50–120k. Review team structure or sales targets.'});
  acts.push({p:'green',t:'Register with ICO if you hold customer data — <strong>ico.org.uk · £40/yr</strong> · required by law'});

  document.getElementById('acts').innerHTML=acts.slice(0,9).map(a=>`
    <div class="act-item"><div class="act-dot dot-${a.p}"></div><div class="act-text">${a.t}</div></div>`).join('');

  // ── URGENT CHECKLIST ──
  const urgent=[
    {tone:'red',text:'Review your health indicators above and note all critical red items.'},
    {tone:'amber',text:'Register with HMRC for Corporation Tax within 3 months of trading — gov.uk/register-for-corporation-tax.'},
    {tone:'amber',text:'Register with ICO if you hold any customer data — ico.org.uk · £40/yr.'},
    {tone:'green',text:'Verify all staff are paid at least £12.21/hr (National Living Wage, Apr 2025).'},
  ];
  if(d.totRev>=67500) urgent.unshift({tone:'amber',text:'Register for VAT — you are approaching the £90,000 annual threshold. Deadline: 30 days after exceeding it.'});
  if(d.runway!==null&&d.runway<1) urgent.unshift({tone:'red',text:'Cash runway critical — contact your bank today about an overdraft or emergency facility.'});
  document.getElementById('urgentCl').innerHTML=urgent.map(item=>`
    <label class="ck-item"><input type="checkbox" disabled>${checklistLeadHTML(item.tone)}<span class="ck-txt">${item.text}</span></label>`).join('');

  const results=document.getElementById('results');
  results.style.display='grid';
  requestAnimationFrame(()=>{
    results.classList.add('is-open');
  });
  syncBenchFillHeight();
  setTimeout(syncBenchFillHeight, 120);
  saveResultsSnapshot();
  window.scrollTo({top:0,behavior:'smooth'});

  window.__fintoriVerdictData = d;
  resetVerdictAI();
}

function syncBenchFillHeight() {
  const benchCard = document.getElementById('resultBench');
  const costsCard = document.getElementById('resultCosts');
  const fillArt = document.querySelector('.bench-fill-art');
  if (!benchCard || !costsCard || !fillArt) return;

  fillArt.style.minHeight = '';
  if (window.innerWidth <= 980) return;

  const baseHeight = 156;
  const gap = costsCard.offsetHeight - benchCard.offsetHeight;
  fillArt.style.minHeight = `${Math.max(baseHeight + gap, baseHeight)}px`;
}

function syncVerdictAIHeight(){
  const content = document.getElementById('verdictAIContent');
  if(!content || !content.classList.contains('ready')) return;
  content.style.maxHeight = content.scrollHeight + 'px';
}

function resetVerdictAI(){
  const trigger = document.getElementById('verdictAITrigger');
  const loading = document.getElementById('verdictAILoading');
  const content = document.getElementById('verdictAIContent');
  if(trigger){
    trigger.classList.remove('is-hidden');
    trigger.classList.remove('is-busy');
    trigger.disabled = false;
    trigger.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Generate AI Report</span>';
  }
  if(loading){
    loading.style.display = 'none';
    loading.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:13px;opacity:.85"><span class="btn-spin"></span><span>Analysis in process...</span></div>';
  }
  if(content){
    content.classList.remove('ready');
    content.style.maxHeight = '0px';
  }
  ['vai_problem','vai_opportunity','vai_steps'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = '';
  });
}

function requestVerdictAI(){
  const d = window.__fintoriVerdictData;
  if(!d) return;
  const trigger = document.getElementById('verdictAITrigger');
  const loading = document.getElementById('verdictAILoading');
  if(trigger){
    trigger.disabled = true;
    trigger.classList.add('is-busy');
    trigger.innerHTML = '<span class="btn-spin"></span><span>Analysis in process...</span>';
  }
  if(loading){
    loading.style.display = 'none';
  }
  loadVerdictAI(d);
}

function startOver(){
  const results=document.getElementById('results');
  results.style.display='none';
  results.classList.remove('is-open');
  localStorage.removeItem(RESULTS_STORAGE_KEY);
  localStorage.removeItem(FORM_STORAGE_KEY);
  window.__fintoriVerdictData = null;
  unlockedStep=1;
  syncNavLockState();
  getPersistedFields().forEach(el => {
    if(el.type === 'checkbox'){
      el.checked = el.id === 'vatReg';
    } else {
      el.value = '';
    }
  });
  recalc();
  goTo(1);
}

// ── AI FUNCTIONS ─────────────────────────────────────────────────────
const openPanels = new Set();

function askWhy(uid, metricName, ctxStr) {
  let ctx = {};
  try { ctx = typeof ctxStr === 'string' ? JSON.parse(ctxStr) : ctxStr; } catch(e){}
  const panel = document.getElementById('panel_' + uid);
  const btn = document.getElementById('btn_' + uid);
  const bodyEl = document.getElementById('body_' + uid);

  if (openPanels.has(uid)) {
    panel.classList.remove('open');
    openPanels.delete(uid);
    btn.innerHTML = '<span class="ai-icon"><i class="fas fa-wand-magic-sparkles"></i></span> Why?';
    return;
  }

  panel.classList.add('open');
  openPanels.add(uid);
  btn.innerHTML = '<span class="ai-icon"><i class="fas fa-wand-magic-sparkles"></i></span> Close';

  if (btn.dataset.loaded === '1') return;
  btn.classList.add('loading');

  const prompt = buildMetricPrompt(metricName, ctx);
  callClaudeAPI(prompt).then(text => {
    btn.dataset.loaded = '1';
    btn.classList.remove('loading');
    renderMetricAI(bodyEl, text);
  }).catch(() => {
    btn.classList.remove('loading');
    bodyEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:4px 0">Unable to load AI analysis. Please try again.</div>';
  });
}

function buildMetricPrompt(metricName, ctx) {
  return `You are a concise UK business financial analyst. A UK small business owner is viewing their financial dashboard.

Metric: ${metricName}
Current value: ${ctx.value}
Status: ${ctx.status==='good'?'healthy':ctx.status==='moderate'?'needs attention':'critical'}
Business sector: ${ctx.sector||'UK SME'}
Financial data: ${JSON.stringify(ctx)}

Respond in this EXACT JSON format only, no markdown, no extra text:
{"what":"One sentence explaining what this metric actually measures in plain English (max 20 words)","why":"2-3 sentences explaining WHY this specific number occurred, based on the actual data. Reference specific figures.","action":"2-3 concrete specific actions this owner should take RIGHT NOW. Be specific with numbers and timelines."}`;
}

function getBackendBaseUrl() {
  if (window.FINTORI_API_BASE) {
    return String(window.FINTORI_API_BASE).replace(/\/+$/, '');
  }
  const { protocol, hostname, port, origin } = window.location;
  if (port === '5500') {
    return `${protocol}//${hostname}:5000`;
  }
  return origin.replace(/\/+$/, '');
}

function backendUrl(path) {
  return `${getBackendBaseUrl()}/${String(path).replace(/^\/+/, '')}`;
}

// SECURITY: Never hard-code PROXY_TOKEN here.
// The server must inject it at page-load time as:
//   <script>window.FINTORI_TOKEN = "{{ proxy_token }}";</script>
// If the variable is absent the proxy will return 401 — intentional.
async function callClaudeAPI(prompt) {
  const response = await fetch(backendUrl('proxy.py'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Token': window.FINTORI_TOKEN || ''
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(()=>({}));
    throw new Error(err.error || 'API error ' + response.status);
  }
  const data = await response.json();
  return data.content[0].text;
}

function renderMetricAI(el, rawText) {
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    const j = JSON.parse(clean);
    el.innerHTML = `
      <div class="ai-section">
        <div class="ai-section-ttl"><i class="fas fa-thumbtack"></i> What it means</div>
        <div class="ai-section-body">${j.what}</div>
      </div>
      <div class="ai-section">
        <div class="ai-section-ttl"><i class="fas fa-magnifying-glass"></i> Why this happened</div>
        <div class="ai-section-body">${j.why}</div>
      </div>
      <div class="ai-section">
        <div class="ai-section-ttl"><i class="fas fa-bolt"></i> What to do</div>
        <div class="ai-section-body">${j.action}</div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="ai-section"><div class="ai-section-body" style="white-space:pre-wrap;font-size:12px">${rawText}</div></div>`;
  }
}

async function loadVerdictAI(d) {
  const prompt = `You are a sharp UK business financial analyst giving a top-level verdict on an SME.

Sector: ${d.bench.label}
Avg monthly revenue: £${Math.round(d.avgRev)}
Net margin: ${(d.netMgn*100).toFixed(1)}% (sector avg: ${(d.bench.net*100).toFixed(1)}%)
Gross margin: ${(d.grossMgn*100).toFixed(1)}% (sector avg: ${(d.bench.gross*100).toFixed(1)}%)
EBITDA/month: £${Math.round(d.ebitdaM)}
Cash runway: ${d.avgRev>0?d.runway.toFixed(1)+' months':'unknown'}
Working capital ratio: ${d.wcr!==null?d.wcr.toFixed(2)+'x':'N/A'}
Debt/Revenue: ${d.avgRev>0?d.debtRatio.toFixed(1)+'x':'N/A'}
Revenue trend: £${Math.round(d.r1)} → £${Math.round(d.r2)} → £${Math.round(d.r3)}
Top costs: ${d.costMap.slice(0,3).map(c=>c.n+' £'+Math.round(c.a)+'/mo').join(', ')||'N/A'}

Respond in this EXACT JSON format only, no markdown:
{"problem":"The single biggest financial problem. One sentence, reference actual numbers.","opportunity":"The single biggest opportunity available now. One sentence, specific and actionable.","steps":["Step 1: specific action with number or deadline","Step 2: specific action","Step 3: specific action"]}`;

  try {
    const text = await callClaudeAPI(prompt);
    const clean = text.replace(/```json|```/g,'').trim();
    const j = JSON.parse(clean);
    const content = document.getElementById('verdictAIContent');
    document.getElementById('vai_problem').innerHTML =
      `<span class="verdict-ai-ttl"><i class="fas fa-circle-xmark"></i> Main Problem</span><div class="verdict-ai-body">${j.problem}</div>`;
    document.getElementById('vai_opportunity').innerHTML =
      `<span class="verdict-ai-ttl"><i class="fas fa-circle-check"></i> Main Opportunity</span><div class="verdict-ai-body">${j.opportunity}</div>`;
    document.getElementById('vai_steps').innerHTML =
      `<span class="verdict-ai-ttl"><i class="fas fa-arrow-right"></i> Next Steps</span><ol class="verdict-ai-steps">${j.steps.map(s=>`<li><span>${s}</span></li>`).join('')}</ol>`;
    document.getElementById('verdictAILoading').style.display = 'none';
    const trigger = document.getElementById('verdictAITrigger');
    if(trigger){
      trigger.classList.remove('is-busy');
      trigger.classList.add('is-hidden');
    }
    content.classList.add('ready');
    content.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      syncVerdictAIHeight();
      setTimeout(() => {
        syncVerdictAIHeight();
      }, 220);
    });
  } catch(e) {
    const loading = document.getElementById('verdictAILoading');
    const trigger = document.getElementById('verdictAITrigger');
    if(loading){
      loading.style.display = 'flex';
      loading.innerHTML = '<div style="font-size:12px;opacity:.7">AI analysis unavailable.</div>';
    }
    if(trigger){
      trigger.disabled = false;
      trigger.classList.remove('is-hidden','is-busy');
      trigger.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Generate AI Report</span>';
    }
  }
}

syncNavLockState();
function toggleMore(){
  const f=document.getElementById('moreFields');
  const b=document.getElementById('moreBtn');
  const open=!f.classList.contains('open');
  const height=f.scrollHeight;
  f.style.setProperty('--more-open-height', height + 'px');
  f.classList.toggle('open', open);
  b.innerHTML=open?'<i class="fas fa-minus"></i> Hide more expenses':'<i class="fas fa-plus"></i> Add more expenses';
}

function initAppChrome(){
  const navLabels=['1 · Revenue','2 · Costs','3 · Business','4 · Results'];
  navLabels.forEach((label,index)=>{
    const btn=document.getElementById('sb'+(index+1));
    if(btn) btn.textContent=label;
  });

  document.getElementById('sb1')?.setAttribute('onclick','requestStep(1)');
  document.getElementById('sb2')?.setAttribute('onclick','requestStep(2)');
  document.getElementById('sb3')?.setAttribute('onclick','requestStep(3)');
  document.getElementById('sb4')?.setAttribute('onclick','requestStep(4)');

  const icons=['fa-wallet','fa-industry','fa-receipt','fa-building','fa-scale-balanced','fa-gauge-high','fa-chart-column','fa-chart-pie','fa-bolt','fa-file-invoice-dollar','fa-list-check'];
  document.querySelectorAll('.card-hdr .cicon').forEach((el,index)=>{
    el.innerHTML='<i class="fas '+(icons[index] || 'fa-circle')+'"></i>';
  });

  document.querySelectorAll('.tip-btn').forEach(btn=>{
    btn.type='button';
    btn.setAttribute('aria-label','Show help');
    btn.innerHTML='<i class="fas fa-circle-info"></i>';
  });

  const privacy=document.querySelector('.privacy');
  if(privacy) privacy.innerHTML='<i class="fas fa-shield-alt"></i> Your data never leaves this device.';

  const primaryButtons=document.querySelectorAll('#s1 .btn-navy, #s2 .btn-navy, #s3 .btn-navy');
  if(primaryButtons[0]) { primaryButtons[0].innerHTML='Next: Your Costs <i class="fas fa-arrow-right"></i>'; primaryButtons[0].setAttribute('onclick','advanceStep(1)'); }
  if(primaryButtons[1]) { primaryButtons[1].innerHTML='Next: Business Details <i class="fas fa-arrow-right"></i>'; primaryButtons[1].setAttribute('onclick','advanceStep(2)'); }
  if(primaryButtons[2]) { primaryButtons[2].innerHTML='<i class="fas fa-chart-line"></i> Get My Analysis'; }

  const backButtons=document.querySelectorAll('#s2 .btn-ghost, #s3 .btn-ghost');
  if(backButtons[0]) { backButtons[0].innerHTML='<i class="fas fa-arrow-left"></i> Back'; backButtons[0].setAttribute('onclick','requestStep(1)'); }
  if(backButtons[1]) { backButtons[1].innerHTML='<i class="fas fa-arrow-left"></i> Back'; backButtons[1].setAttribute('onclick','requestStep(2)'); }

  const actionButtons=document.querySelectorAll('#results .btn');
  if(actionButtons[0]) {
    actionButtons[0].id='exportPdfBtn';
    actionButtons[0].innerHTML='<span class="btn-label"><i class="fas fa-download"></i> Save as PDF</span>';
  }
  if(actionButtons[1]) actionButtons[1].innerHTML='<i class="fas fa-rotate-right"></i> Start New Analysis';

  const moreBtn=document.getElementById('moreBtn');
  if(moreBtn) moreBtn.innerHTML='<i class="fas fa-plus"></i> Add more expenses';
}

function toggleMore(){
  const f=document.getElementById('moreFields');
  const b=document.getElementById('moreBtn');
  if(!f || !b) return;
  const open=!f.classList.contains('open');
  f.classList.toggle('open', open);
  if(open){
    requestAnimationFrame(syncMoreFieldsHeight);
    window.setTimeout(syncMoreFieldsHeight, 180);
  }
  b.innerHTML=open?'<i class="fas fa-minus"></i> Hide more expenses':'<i class="fas fa-plus"></i> Add more expenses';
}

function setExportButtonState(state){
  const btn = document.getElementById('exportPdfBtn');
  if(!btn) return;
  btn.classList.remove('is-busy','is-success');
  btn.disabled = false;

  if(state === 'loading'){
    btn.classList.add('is-busy');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-label"><span class="btn-spin"></span> Preparing PDF...</span>';
    return;
  }

  if(state === 'success'){
    btn.classList.add('is-success');
    btn.innerHTML = '<span class="btn-label"><i class="fas fa-circle-check"></i> PDF ready</span>';
    window.setTimeout(() => setExportButtonState('idle'), 1800);
    return;
  }

  btn.innerHTML = '<span class="btn-label"><i class="fas fa-download"></i> Save as PDF</span>';
}

function sanitizeExportHtml(html){
  return html
    .replace(/Ã‚Â£|Â£/g, '£')
    .replace(/Â·/g, '·')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â†’/g, '→')
    .replace(/â‰¤/g, '≤')
    .replace(/â‰¥/g, '≥')
    .replace(/â†º/g, '↺')
    .replace(/â¬‡/g, '⬇')
    .replace(/ðŸ“Š|ðŸ¥§|ðŸ’·|ðŸŽ¯/g, '')
    .replace(/âš¡/g, '');
}

function sanitizeExportText(text){
  return (text || '')
    .replace(/Ã‚Â£|Â£/g, '£')
    .replace(/Â·/g, '·')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â†’/g, '→')
    .replace(/â‰¤/g, '≤')
    .replace(/â‰¥/g, '≥')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*([,:;!?])/g, '$1')
    .replace(/([,:;!?])(?!\s|$)/g, '$1 ')
    .replace(/\s*[—–]\s*/g, ' — ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

function preparePdfClone(node){
  if(!node) return null;

  node.querySelectorAll('script').forEach(el => el.remove());
  node.querySelectorAll('.theme-toggle, .hdr-badge, .sbtn-home, .action-row, .toast-stack, .verdict-ai, .verdict-ai-trigger').forEach(el => el.remove());
  node.querySelectorAll('[onclick]').forEach(el => el.removeAttribute('onclick'));

  return node;
}

function buildWebsitePdfHtml(){
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const stylesheets = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    new URL('css/style.css', window.location.href).href,
    new URL('app.css', window.location.href).href
  ];
  const fragments = [
    preparePdfClone(document.getElementById('results')?.cloneNode(true))
  ].filter(Boolean).map(el => el.outerHTML).join('\n');

  return sanitizeExportHtml(`<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizeExportText(document.title || 'Fintori Report')}</title>
  <base href="${window.location.origin}/">
  ${stylesheets.map(href => `<link rel="stylesheet" href="${href}">`).join('\n  ')}
  <style>
    @page{
      size:A4;
      margin:8mm;
    }
    html,body{
      margin:0;
      padding:0;
      background:var(--page-bg);
    }
    body{
      width:auto;
      min-width:0;
      overflow:visible;
      font-size:16px;
    }
    body > *{
      box-sizing:border-box;
    }
    #results{
      display:grid !important;
      opacity:1 !important;
      transform:none !important;
      visibility:visible !important;
      width:100% !important;
      max-width:190mm !important;
      margin:0 auto !important;
      gap:14px !important;
    }
    .verdict{
      margin-top:0 !important;
      margin-bottom:18px !important;
      margin-left:0 !important;
      margin-right:0 !important;
      min-height:280px !important;
      width:100% !important;
      height:auto !important;
      overflow:visible !important;
      padding:42px 32px !important;
    }
    .verdict.good{
      background-image:none !important;
      background:linear-gradient(135deg,#0b7b57 0%, #138d69 100%) !important;
    }
    .verdict.warn{
      background-image:none !important;
      background:linear-gradient(135deg,#a05a12 0%, #c27c1e 100%) !important;
    }
    .verdict.bad{
      background-image:none !important;
      background:linear-gradient(135deg,#8d2330 0%, #b03445 100%) !important;
    }
    .summary-top{
      background-image:none !important;
      background:linear-gradient(135deg,#152645 0%, #1c3158 100%) !important;
    }
    .summary-top::before{
      display:none !important;
    }
    .verdict-ai{
      max-width:none !important;
      overflow:visible !important;
      background:none !important;
      border:none !important;
      backdrop-filter:none !important;
      padding:14px 0 0 !important;
      margin-top:16px !important;
      text-align:left !important;
    }
    .verdict-ai-content,
    .verdict-ai-content.ready{
      max-height:none !important;
      height:auto !important;
      overflow:visible !important;
      opacity:1 !important;
      transform:none !important;
      pointer-events:auto !important;
    }
    .verdict-ai-row{
      background:none !important;
      border:none !important;
      border-radius:0 !important;
      padding:0 !important;
      margin:0 0 14px !important;
      break-inside:avoid !important;
      page-break-inside:avoid !important;
    }
    .verdict-ai-ttl{
      display:block !important;
      margin:0 0 6px !important;
      font-size:13px !important;
      letter-spacing:.12em !important;
    }
    .verdict-ai-ttl i{
      display:none !important;
    }
    .verdict-ai-body{
      font-size:14px !important;
      line-height:1.7 !important;
    }
    .verdict-ai-steps{
      margin:4px 0 0 !important;
      padding-left:18px !important;
      list-style:disc !important;
      display:block !important;
    }
    .verdict-ai-steps li{
      display:list-item !important;
      margin:0 0 6px !important;
      padding:0 !important;
      break-inside:avoid !important;
      page-break-inside:avoid !important;
    }
    .verdict-ai-steps li::before{
      display:none !important;
      content:none !important;
    }
    .verdict-ai-steps li span{
      display:inline !important;
      font-size:14px !important;
      line-height:1.7 !important;
    }
    .bench-fill-art{
      background-image:none !important;
      background:linear-gradient(135deg,rgba(21,38,69,.08),rgba(31,77,184,.12)) !important;
    }
    .score-card,
    .card,
    .vat-warn,
    .disclaimer{
      width:100% !important;
      max-width:none !important;
    }
    .kpi-grid,
    .health-grid,
    .checklist-grid,
    .tax-grid{
      gap:12px !important;
    }
    #results .action-row,
    .bench-fill-art,
    #results .verdict-ai,
    #exportPdfBtn{
      display:none !important;
    }
    .summary-top{
      padding:24px 24px !important;
    }
    .summary-breakeven{
      padding:18px 24px 14px !important;
    }
    .card-body,
    #acts,
    #bench,
    #costs{
      padding-left:24px !important;
      padding-right:24px !important;
    }
    @media print{
      html,body{
        background:var(--page-bg) !important;
      }
    }
  </style>
</head>
<body>
  ${fragments}
</body>
</html>`);
}

function buildMobilePdfData(){
  const getText = (selector) => sanitizeExportText(document.querySelector(selector)?.textContent || '');
  const getAllText = (selector) => [...document.querySelectorAll(selector)].map(el => sanitizeExportText(el.textContent)).filter(Boolean);

  return {
    title: getText('#vtitle') || 'Fintori Business Analysis',
    verdict: getText('#vbody'),
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
    summary: [
      ['Revenue (3 months)', getText('#k_rev')],
      ['Profit / Loss', getText('#k_profit')],
      ['Net Margin', getText('#k_margin')],
      ['EBITDA (monthly)', getText('#k_ebitda')],
      ['Cash Runway', getText('#k_runway')],
      ['Breakeven / Month', getText('#k_be')]
    ],
    breakevenTitle: 'Breakeven Analysis',
    breakevenValue: getText('#be_val'),
    breakevenSub: getText('#be_sub'),
    breakevenDetail: getText('#be_detail'),
    health: getAllText('#resultHealth .tl-item').map(t => t.replace(/\s+/g, ' ').trim()),
    benchmarks: getAllText('#bench .bench-item').map(t => t.replace(/\s+/g, ' ').trim()),
    costs: getAllText('#costs .cost-item').map(t => t.replace(/\s+/g, ' ').trim()),
    actions: getAllText('#acts .act-item'),
    vat: document.getElementById('vatWarn')?.style.display !== 'none' ? getText('#vatWarn') : '',
    checklist: getAllText('#urgentCl .ck-item'),
    disclaimer: getText('.disclaimer')
  };
}

function buildMobilePdfHtml(report){
  const list = (items, cls = '') => (items || []).filter(Boolean).map(item => `<li class="${cls}">${item}</li>`).join('');
  const summaryCards = report.summary.map(([label, value]) => `
    <div class="pdf-kpi">
      <div class="pdf-kpi-label">${label}</div>
      <div class="pdf-kpi-value">${value}</div>
    </div>
  `).join('');

  return sanitizeExportHtml(`
    <style>
      .pdf-export{
        width: 760px;
        font-family: Inter, Arial, sans-serif;
        background: #f5f7fb;
        color: #182437;
        padding: 20px;
      }
      .pdf-shell{
        display: grid;
        gap: 16px;
      }
      .pdf-hero{
        background: linear-gradient(135deg, #0d1830 0%, #142543 100%);
        color: #ffffff;
        border-radius: 22px;
        padding: 24px 26px;
      }
      .pdf-eyebrow{
        font-size: 11px;
        letter-spacing: .16em;
        text-transform: uppercase;
        opacity: .72;
        margin-bottom: 10px;
      }
      .pdf-title{
        font-family: "Plus Jakarta Sans", Inter, sans-serif;
        font-size: 28px;
        line-height: 1.08;
        font-weight: 800;
        margin: 0 0 10px;
      }
      .pdf-copy{
        font-size: 15px;
        line-height: 1.7;
        margin: 0;
        opacity: .94;
      }
      .pdf-meta{
        margin-top: 12px;
        font-size: 11px;
        letter-spacing: .12em;
        text-transform: uppercase;
        opacity: .7;
      }
      .pdf-card{
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        overflow: hidden;
      }
      .pdf-card-head{
        padding: 14px 18px;
        background: #edf3ff;
        border-bottom: 1px solid #dbe5f4;
      }
      .pdf-card-head.dark{
        background: linear-gradient(135deg, #152645 0%, #1c3158 100%);
        color: #ffffff;
        border-bottom: none;
      }
      .pdf-card-title{
        font-family: "Plus Jakarta Sans", Inter, sans-serif;
        font-size: 18px;
        font-weight: 800;
        margin: 0;
      }
      .pdf-card-body{
        padding: 18px;
      }
      .pdf-summary-grid{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .pdf-kpi{
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 12px 14px;
        background: #ffffff;
      }
      .pdf-kpi-label{
        font-size: 11px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 6px;
      }
      .pdf-kpi-value{
        font-size: 18px;
        font-weight: 800;
        color: #12203a;
        line-height: 1.2;
      }
      .pdf-breakeven{
        margin-top: 14px;
        border-top: 1px solid #e5edf8;
        padding-top: 14px;
      }
      .pdf-breakeven-box{
        background: linear-gradient(135deg, #f4f8ff 0%, #ecf3ff 100%);
        border: 1px solid #c8d9fb;
        border-radius: 16px;
        padding: 14px 16px;
        margin-top: 10px;
      }
      .pdf-breakeven-label{
        font-size: 11px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #1f4db8;
        margin-bottom: 6px;
        font-weight: 700;
      }
      .pdf-breakeven-value{
        font-size: 26px;
        font-weight: 800;
        color: #1f4db8;
        margin-bottom: 6px;
      }
      .pdf-breakeven-sub{
        font-size: 13px;
        line-height: 1.6;
        color: #35506f;
      }
      .pdf-grid-two{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .pdf-list{
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .pdf-list li{
        font-size: 13px;
        line-height: 1.65;
        color: #24384f;
        padding-left: 14px;
        position: relative;
      }
      .pdf-list li::before{
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #1f4db8;
        position: absolute;
        left: 0;
        top: .55em;
      }
      .pdf-alert{
        padding: 16px 18px;
        border-radius: 18px;
        background: #fff7ed;
        border: 1px solid #fed7aa;
      }
      .pdf-alert-title{
        font-family: "Plus Jakarta Sans", Inter, sans-serif;
        font-size: 17px;
        font-weight: 800;
        color: #c2410c;
        margin: 0 0 8px;
      }
      .pdf-alert-copy{
        font-size: 13px;
        line-height: 1.7;
        color: #7c2d12;
        margin: 0;
      }
      .pdf-note{
        font-size: 11px;
        line-height: 1.75;
        color: #64748b;
        padding: 4px 2px 0;
      }
    </style>
    <div class="pdf-export">
      <div class="pdf-shell">
        <section class="pdf-hero">
          <div class="pdf-eyebrow">Fintori Financial Analysis</div>
          <h1 class="pdf-title">${report.title || 'Fintori Business Analysis'}</h1>
          <p class="pdf-copy">${report.verdict}</p>
          <div class="pdf-meta">Generated ${report.date}</div>
        </section>

        <section class="pdf-card">
          <div class="pdf-card-head dark">
            <h2 class="pdf-card-title">3-Month Summary</h2>
          </div>
          <div class="pdf-card-body">
            <div class="pdf-summary-grid">${summaryCards}</div>
            <div class="pdf-breakeven">
              <h3 class="pdf-card-title" style="font-size:16px;color:#12203a;">${report.breakevenTitle}</h3>
              <div class="pdf-breakeven-box">
                <div class="pdf-breakeven-label">Monthly Breakeven Revenue</div>
                <div class="pdf-breakeven-value">${report.breakevenValue}</div>
                <div class="pdf-breakeven-sub">${report.breakevenSub}</div>
              </div>
              <div class="pdf-note">${report.breakevenDetail}</div>
            </div>
          </div>
        </section>

        <section class="pdf-grid-two">
          <div class="pdf-card">
            <div class="pdf-card-head"><h2 class="pdf-card-title">Health Indicators</h2></div>
            <div class="pdf-card-body"><ul class="pdf-list">${list(report.health)}</ul></div>
          </div>
          <div class="pdf-card">
            <div class="pdf-card-head"><h2 class="pdf-card-title">vs UK Sector Average</h2></div>
            <div class="pdf-card-body"><ul class="pdf-list">${list(report.benchmarks)}</ul></div>
          </div>
        </section>

        <section class="pdf-card">
          <div class="pdf-card-head"><h2 class="pdf-card-title">Cost Breakdown</h2></div>
          <div class="pdf-card-body"><ul class="pdf-list">${list(report.costs)}</ul></div>
        </section>

        ${report.vat ? `
          <section class="pdf-alert">
            <h2 class="pdf-alert-title">VAT Threshold Alert</h2>
            <p class="pdf-alert-copy">${report.vat}</p>
          </section>
        ` : ''}

        <section class="pdf-card">
          <div class="pdf-card-head"><h2 class="pdf-card-title">Recommended Actions</h2></div>
          <div class="pdf-card-body"><ul class="pdf-list">${list(report.actions)}</ul></div>
        </section>

        <section class="pdf-card">
          <div class="pdf-card-head"><h2 class="pdf-card-title">Action Checklist</h2></div>
          <div class="pdf-card-body"><ul class="pdf-list">${list(report.checklist)}</ul></div>
        </section>

        <div class="pdf-note">${report.disclaimer}</div>
      </div>
    </div>
  `);
}

function renderTextPdf(doc, report){
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;
  const navy = [13, 24, 48];
  const navyMid = [20, 37, 67];
  const blue = [31, 77, 184];
  const blueSoft = [237, 243, 255];
  const border = [229, 231, 235];
  const text = [24, 36, 55];
  const muted = [90, 102, 119];

  const ensureSpace = (needed = 12) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  const measureLines = (text, size = 11, width = maxWidth) => {
    doc.setFontSize(size);
    return doc.splitTextToSize(text || '', width);
  };

  const writeLines = (lines, x, size = 11, weight = 'normal', color = text, lineFactor = 0.54) => {
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(lines, x, y);
    y += lines.length * size * lineFactor;
  };

  const writeBlock = (content, size = 11, weight = 'normal', color = text, gap = 8, width = maxWidth) => {
    if (!content) return;
    const lines = measureLines(content, size, width);
    const blockHeight = lines.length * size * 0.54 + gap;
    ensureSpace(blockHeight);
    writeLines(lines, margin, size, weight, color);
    y += gap;
  };

  const drawCard = (title, items, options = {}) => {
    if (!items || !items.length) return;
    const titleSize = options.titleSize || 13;
    const bodySize = options.bodySize || 10;
    const titleLines = measureLines(title, titleSize, maxWidth - 18);
    const itemLines = items.map(item => measureLines(item, bodySize, maxWidth - 24));
    const cardHeight =
      16 +
      titleLines.length * titleSize * 0.52 +
      10 +
      itemLines.reduce((sum, lines) => sum + lines.length * bodySize * 0.52 + 6, 0) +
      6;

    ensureSpace(cardHeight);
    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, maxWidth, cardHeight, 4, 4, 'FD');

    doc.setFillColor(...blueSoft);
    doc.roundedRect(margin, y, maxWidth, 16 + titleLines.length * titleSize * 0.52, 4, 4, 'F');
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin, y + 16 + titleLines.length * titleSize * 0.52);

    y += 10;
    writeLines(titleLines, margin + 10, titleSize, 'bold', blue, 0.52);
    y += 8;

    itemLines.forEach((lines) => {
      doc.setFillColor(...blue);
      doc.circle(margin + 5, y - 1.5, 1.1, 'F');
      writeLines(lines, margin + 10, bodySize, 'normal', text, 0.52);
      y += 6;
    });

    y += 6;
  };

  const drawSummaryCard = () => {
    const summaryLines = report.summary.map(([label, value]) => `${label}: ${value}`);
    const beLine = `${report.breakevenValue} — ${report.breakevenSub}`;
    const blocks = [
      ...summaryLines.map(line => measureLines(line, 10, maxWidth - 20)),
      measureLines(beLine, 10, maxWidth - 20),
      measureLines(report.breakevenDetail, 10, maxWidth - 20)
    ];
    const cardHeight =
      18 + 14 * 0.52 + 10 +
      blocks.reduce((sum, lines, index) => sum + lines.length * 10 * 0.52 + (index === summaryLines.length ? 10 : 5), 0) +
      10;

    ensureSpace(cardHeight);
    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, maxWidth, cardHeight, 4, 4, 'FD');

    doc.setFillColor(...navyMid);
    doc.roundedRect(margin, y, maxWidth, 24, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('3-Month Summary', margin + 8, y + 14);

    y += 34;
    summaryLines.forEach(line => writeBlock(line, 10, 'normal', text, 5));
    y += 2;
    doc.setDrawColor(229, 237, 248);
    doc.line(margin + 8, y, margin + maxWidth - 8, y);
    y += 10;
    writeBlock(report.breakevenTitle, 12, 'bold', blue, 5);
    writeBlock(beLine, 10, 'normal', text, 5);
    writeBlock(report.breakevenDetail, 10, 'normal', text, 8);
  };

  doc.setFillColor(...navyMid);
  doc.roundedRect(margin, y - 2, maxWidth, 28, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(report.title || 'Fintori Business Analysis', margin + 8, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${report.date}`, margin + 8, y + 16);
  y += 38;

  drawCard('Overall Assessment', [report.verdict], { titleSize: 12, bodySize: 10 });
  drawSummaryCard();
  drawCard('Health Indicators', report.health);
  drawCard('vs UK Sector Average', report.benchmarks);
  drawCard('Cost Breakdown', report.costs);
  if (report.vat) drawCard('VAT Threshold Alert', [report.vat], { titleSize: 12, bodySize: 10 });
  drawCard('Recommended Actions', report.actions);
  drawCard('Action Checklist', report.checklist);
  writeBlock(report.disclaimer, 9, 'normal', muted, 6);
}

async function exportReport(){
  const results = document.getElementById('results');
  if(!results){
    showToast('Unable to generate PDF. Please refresh and try again.');
    return;
  }

  setExportButtonState('loading');
  await new Promise(resolve => window.setTimeout(resolve, 80));

  const stamp = new Date().toISOString().slice(0,10);

  try {
    if(typeof window.jspdf === 'undefined') throw new Error('jsPDF not loaded.');
    if(typeof window.html2canvas === 'undefined') throw new Error('html2canvas not loaded.');

    const { jsPDF } = window.jspdf;

    // Рендерим HTML в скрытый div прямо на странице
    const report = buildMobilePdfData();
    const html = buildMobilePdfHtml(report);

    const container = document.createElement('div');
    container.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:0',
      'width:800px',
      'background:#f5f7fb',
      'z-index:-1',
      'pointer-events:none',
    ].join(';');
    container.innerHTML = html;
    document.body.appendChild(container);

    // Ждём рендера и шрифтов
    await new Promise(resolve => window.setTimeout(resolve, 600));
    await document.fonts.ready;

    const target = container.querySelector('.pdf-export') || container; 
    const totalHeight = target.scrollHeight || container.scrollHeight;


    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#f5f7fb',
      width: 800,
      height: totalHeight,
      windowWidth: 800,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    document.body.removeChild(container);

    if(canvas.width === 0 || canvas.height === 0){
      throw new Error('Canvas is empty — nothing to render.');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const pageCount = Math.ceil(imgH / pageH);

    for(let i = 0; i < pageCount; i++){
      if(i > 0) doc.addPage();
      doc.addImage(imgData, 'JPEG', 0, -(i * pageH), imgW, imgH);
    }

    doc.save(`fintori-report-${stamp}.pdf`);
    setExportButtonState('success');

  } catch(error){
    console.error('PDF export error:', error);
    setExportButtonState('idle');
    showToast('PDF export failed: ' + error.message);
  }
}

initAppChrome();
restoreFormState();
recalc();
bindFormPersistence();
computeUnlockedStep();
syncNavLockState();
document.addEventListener("DOMContentLoaded", () => {
  const rotatingButtons = document.querySelectorAll(".rotating-cta");
  if (!rotatingButtons.length) return;
  let angle = 0;
  const rotateBorder = () => {
    angle = (angle + 1) % 360;
    rotatingButtons.forEach((button) => {
      button.style.setProperty("--angle", `${angle}deg`);
    });
    requestAnimationFrame(rotateBorder);
  };
  rotateBorder();
});
window.addEventListener('resize', syncBenchFillHeight);
window.addEventListener('resize', syncVerdictAIHeight);
goTo(Math.min(Math.max(getStepFromUrl(), 1), unlockedStep));
