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
const fm=n=>'£'+Math.round(Math.abs(n)).toLocaleString('en-GB');
const fp=n=>(n*100).toFixed(1)+'%';
const fmSign=n=>(n<0?'-£':'£')+Math.round(Math.abs(n)).toLocaleString('en-GB');

function tip(id){
  const el=document.getElementById(id);
  el.classList.toggle('show');
}

function toggleMore(){
  const f=document.getElementById('moreFields');
  const b=document.getElementById('moreBtn');
  const open=f.classList.toggle('open');
  b.textContent=open?'− Hide additional expenses':'＋ Add more expenses (utilities, insurance, marketing…)';
}

function recalc(){
  const d=document.getElementById('vatReg').checked?1.2:1;
  ['1','2','3'].forEach(i=>{
    document.getElementById('rn'+i).textContent=fm(v('r'+i)/d);
  });
}

// ── NAVIGATION ───────────────────────────────────────────────────────
function goTo(n){
  [1,2,3].forEach(i=>{
    const s=document.getElementById('s'+i);
    if(s) s.classList.toggle('active',i===n);
    const b=document.getElementById('sb'+i);
    b.classList.toggle('active',i===n);
    if(i<n) b.classList.add('done'); else if(i>n) b.classList.remove('done');
  });
  document.getElementById('results').style.display='none';
  document.getElementById('loading').style.display='none';
  const pct=[20,50,80,100];
  document.getElementById('prog').style.width=pct[n-1]+'%';
  document.getElementById('sb4').classList.toggle('active',n===4);
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

  const runway=avgRev>0?cash/avgRev:0;
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
    d.runway<1&&d.avgRev>0,
    d.wcr!==null&&d.wcr<1,
    d.debtRatio>6,
  ].filter(Boolean).length;
  const amberCount=[
    d.netMgn>=0&&d.netMgn<0.05,
    d.runway>=1&&d.runway<3,
    d.debtorDays!==null&&d.debtorDays>60,
  ].filter(Boolean).length;

  const verd=document.getElementById('verdict');
  verd.className='verdict '+(redCount>=2?'bad':amberCount>=2||redCount===1?'warn':'good');
  document.getElementById('vicon').textContent=redCount>=2?'⚠️':amberCount>=2||redCount===1?'📋':'✅';
  document.getElementById('vtitle').textContent=
    redCount>=2?'Immediate action needed':
    amberCount>=2||redCount===1?'A few areas need attention':
    'Business looks healthy';
  document.getElementById('vbody').textContent=
    redCount>=2?'Your business has '+redCount+' critical indicators. Focus on the red actions below before anything else.':
    amberCount>=2||redCount===1?'Most metrics are acceptable but '+( redCount+amberCount)+' area'+(redCount+amberCount>1?'s need':'needs')+' attention. See recommended actions below.':
    'Your key metrics are within healthy ranges. Keep monitoring monthly and use the growth actions below to push further.';

  // ── KPIs ──
  document.getElementById('k_rev').textContent=fm(d.totRev);
  const profEl=document.getElementById('k_profit');
  profEl.textContent=fmSign(d.totProfit);
  profEl.className='kpi-val'+(d.totProfit<0?' neg':'');
  document.getElementById('k_margin').textContent=fp(d.netMgn);
  document.getElementById('k_ebitda').textContent=fmSign(d.ebitdaM)+'/mo';
  document.getElementById('k_runway').textContent=d.avgRev>0?d.runway.toFixed(1)+' mo':'—';
  document.getElementById('k_be').textContent=d.breakeven!==null?fm(d.breakeven)+'/mo':'—';

  // ── BREAKEVEN ──
  if(d.breakeven!==null){
    document.getElementById('be_val').textContent=fm(d.breakeven);
    document.getElementById('be_sub').textContent='The minimum monthly revenue to cover all costs';
    const gap=d.breakevenGap;
    const pct=d.avgRev>0?(d.avgRev/d.breakeven*100).toFixed(0):0;
    document.getElementById('be_detail').innerHTML=
      '<strong>Current avg monthly revenue:</strong> '+fm(d.avgRev)+'<br>'+
      '<strong>Breakeven:</strong> '+fm(d.breakeven)+'<br>'+
      '<strong>You are at '+pct+'% of breakeven</strong><br><br>'+
      (gap>0
        ? '✅ You are <strong>'+fm(gap)+' above breakeven</strong> per month. That is your safety buffer.'
        : '🔴 You are <strong>'+fm(Math.abs(gap))+' below breakeven</strong> per month. Every month you lose this amount.');
  } else {
    document.getElementById('be_val').textContent='—';
    document.getElementById('be_detail').textContent='Enter gross margin data to calculate breakeven.';
  }

  // ── TRAFFIC LIGHTS ──
  const tlProfit=[
    {m:'Gross Margin',     val:fp(d.grossMgn),   s:d.grossMgn>=.35?'green':d.grossMgn>=.2?'amber':'red',  l:d.grossMgn>=.35?'🟢 Strong':d.grossMgn>=.2?'🟡 Moderate':'🔴 Low',
     aiCtx:{metric:'Gross Margin',value:fp(d.grossMgn),status:d.grossMgn>=.35?'good':d.grossMgn>=.2?'moderate':'bad',avgRev:Math.round(d.avgRev),cogsM:Math.round(d.cogsM),sector:d.bench.label,benchmark:fp(d.bench.gross)}},
    {m:'Net Margin (avg)', val:fp(d.netMgn),     s:d.netMgn>=.1?'green':d.netMgn>=.05?'amber':'red',      l:d.netMgn>=.1?'🟢 Healthy':d.netMgn>=.05?'🟡 Below avg':'🔴 Critical',
     aiCtx:{metric:'Net Margin',value:fp(d.netMgn),status:d.netMgn>=.1?'good':d.netMgn>=.05?'moderate':'bad',avgRev:Math.round(d.avgRev),totalCostsM:Math.round(d.totalCostsM),topCosts:d.costMap.slice(0,3).map(c=>c.n+' £'+Math.round(c.a)),sector:d.bench.label,benchmark:fp(d.bench.net)}},
    {m:'EBITDA',           val:fmSign(d.ebitdaM)+'/mo', s:d.ebitdaM>0?'green':d.ebitdaM===0?'amber':'red', l:d.ebitdaM>0?'🟢 Positive':d.ebitdaM===0?'🟡 Break-even':'🔴 Negative',
     aiCtx:{metric:'EBITDA',value:fmSign(d.ebitdaM)+'/mo',status:d.ebitdaM>0?'good':d.ebitdaM===0?'moderate':'bad',ebitda:Math.round(d.ebitdaM),loanRepayments:Math.round(v('loan')),netProfit:Math.round(d.totProfit/3)}},
    {m:'Revenue Trend',    val:(d.revGrowth>=0?'+':'')+fp(d.revGrowth), s:d.revGrowth>0?'green':d.revGrowth===0?'amber':'red', l:d.revGrowth>0?'🟢 Growing':d.revGrowth===0?'🟡 Flat':'🔴 Declining',
     aiCtx:{metric:'Revenue Trend',value:(d.revGrowth>=0?'+':'')+fp(d.revGrowth),status:d.revGrowth>0?'good':d.revGrowth===0?'moderate':'bad',m1:Math.round(d.r1),m2:Math.round(d.r2),m3:Math.round(d.r3)}},
  ];
  const tlCash=[
    {m:'Cash Runway',       val:d.avgRev>0?d.runway.toFixed(1)+' months':'—', s:d.runway>=3?'green':d.runway>=1?'amber':'red', l:d.runway>=3?'🟢 Good':d.runway>=1?'🟡 Tight':'🔴 Danger',
     aiCtx:{metric:'Cash Runway',value:d.avgRev>0?d.runway.toFixed(1)+' months':'N/A',status:d.runway>=3?'good':d.runway>=1?'moderate':'bad',cash:Math.round(d.cash),avgMonthlyCosts:Math.round(d.totalCostsM),avgRev:Math.round(d.avgRev)}},
    {m:'Working Capital',   val:d.wcr!==null?d.wcr.toFixed(2)+'x':'—',       s:d.wcr===null?'green':d.wcr>=1.5?'green':d.wcr>=1?'amber':'red', l:d.wcr===null?'—':d.wcr>=1.5?'🟢 Healthy':d.wcr>=1?'🟡 Tight':'🔴 Danger',
     aiCtx:{metric:'Working Capital',value:d.wcr!==null?d.wcr.toFixed(2)+'x':'N/A',status:d.wcr===null?'good':d.wcr>=1.5?'good':d.wcr>=1?'moderate':'bad',cash:Math.round(d.cash),debtors:Math.round(d.debtors),creditors:Math.round(d.creditors),debt:Math.round(d.debt),workingCapital:Math.round(d.workingCapital)}},
    {m:'Debt / Revenue',    val:d.avgRev>0?d.debtRatio.toFixed(1)+'x':'—',   s:d.debtRatio<=3?'green':d.debtRatio<=6?'amber':'red', l:d.debtRatio<=3?'🟢 Manageable':d.debtRatio<=6?'🟡 Monitor':'🔴 High',
     aiCtx:{metric:'Debt to Revenue',value:d.avgRev>0?d.debtRatio.toFixed(1)+'x':'N/A',status:d.debtRatio<=3?'good':d.debtRatio<=6?'moderate':'bad',debt:Math.round(d.debt),avgRev:Math.round(d.avgRev),loanRepayments:Math.round(v('loan'))}},
  ];
  const tlEff=[];
  if(d.debtorDays!==null&&d.debtors>0){
    const dd=Math.round(d.debtorDays), bdd=d.bench.debtDays;
    tlEff.push({m:'Debtor Days',val:dd+' days (target '+bdd+'d)',s:dd<=bdd?'green':dd<=bdd*2?'amber':'red',l:dd<=bdd?'🟢 On target':dd<=bdd*2?'🟡 Slow':'🔴 Too slow',
      aiCtx:{metric:'Debtor Days',value:dd+' days',status:dd<=bdd?'good':dd<=bdd*2?'moderate':'bad',debtors:Math.round(d.debtors),avgMonthlyRev:Math.round(d.avgRev),debtorDays:dd,benchmarkDays:bdd,sector:d.bench.label}});
  }
  if(d.creditorDays!==null&&d.creditors>0){
    const cd=Math.round(d.creditorDays);
    tlEff.push({m:'Creditor Days',val:cd+' days',s:cd<=60?'green':cd<=90?'amber':'red',l:cd<=60?'🟢 Good':cd<=90?'🟡 Getting long':'🔴 Risk of disputes',
      aiCtx:{metric:'Creditor Days',value:cd+' days',status:cd<=60?'good':cd<=90?'moderate':'bad',creditors:Math.round(d.creditors),creditorDays:cd}});
  }
  if(d.stockDays!==null&&d.bench.stockDays){
    const sd=Math.round(d.stockDays), bsd=d.bench.stockDays;
    tlEff.push({m:'Stock Turnover',val:sd+' days (target '+bsd+'d)',s:sd<=bsd?'green':sd<=bsd*2?'amber':'red',l:sd<=bsd?'🟢 Good':sd<=bsd*2?'🟡 Monitor':'🔴 Slow',
      aiCtx:{metric:'Stock Turnover',value:sd+' days',status:sd<=bsd?'good':sd<=bsd*2?'moderate':'bad',stock:Math.round(d.stock),stockDays:sd,benchmarkDays:bsd,cogsM:Math.round(d.cogsM)}});
  }
  if(d.revPerEmp!==null&&d.emp>0){
    const rpe=Math.round(d.revPerEmp);
    tlEff.push({m:'Revenue / Employee',val:'£'+rpe.toLocaleString('en-GB')+'/yr',s:rpe>=80000?'green':rpe>=40000?'amber':'red',l:rpe>=80000?'🟢 Strong':rpe>=40000?'🟡 Average':'🔴 Low',
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
            <button class="ai-why-btn" id="btn_${uid}" data-ctx='${ctxData.replace(/'/g,"&#39;")}' data-metric="${t.m}" onclick="askWhy('${uid}', this.dataset.metric, this.dataset.ctx)">
              <span class="ai-icon">✦</span> Why?
            </button>
          </div>
          <div class="tl-value">${t.val}</div>
        </div>
        <div class="tl-badge tl-${t.s}">${t.l}</div>
      </div>
      <div class="ai-panel" id="panel_${uid}">
        <div class="ai-panel-inner">
          <div class="ai-avatar">✦</div>
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
  if(d.runway<1&&d.avgRev>0) acts.push({p:'red',t:'<strong>Less than 1 month cash.</strong> Contact your bank about an overdraft or emergency business loan today.'});
  if(d.wcr!==null&&d.wcr<1) acts.push({p:'red', t:'<strong>Working Capital Ratio below 1.0x.</strong> You may struggle to pay short-term obligations. Speak to your bank about a working capital facility.'});
  if(d.debtorDays!==null&&d.debtorDays>60) acts.push({p:'red',t:'<strong>Debtor days '+Math.round(d.debtorDays)+'d — dangerously slow.</strong> Chase all overdue invoices. Consider a 2% early payment discount or invoice factoring.'});
  if(d.runway>=1&&d.runway<3) acts.push({p:'amber',t:'<strong>Cash runway under 3 months.</strong> Cut non-essential spending and chase all outstanding invoices this week.'});
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
    'Review your health indicators above and note all 🔴 red items',
    'Register with HMRC for Corporation Tax within 3 months of trading — gov.uk/register-for-corporation-tax',
    'Register with ICO if you hold any customer data — ico.org.uk · £40/yr',
    'Verify all staff are paid at least £12.21/hr (National Living Wage, Apr 2025)',
  ];
  if(d.totRev>=67500) urgent.unshift('⚠️ Register for VAT — you are approaching the £90,000 annual threshold. Deadline: 30 days after exceeding it.');
  if(d.runway<1&&d.avgRev>0) urgent.unshift('🚨 Cash runway critical — contact your bank today about an overdraft or emergency facility.');
  document.getElementById('urgentCl').innerHTML=urgent.map(t=>`
    <label class="ck-item"><input type="checkbox"><span class="ck-txt">${t}</span></label>`).join('');

  document.getElementById('results').style.display='block';
  window.scrollTo({top:0,behavior:'smooth'});

  // Trigger AI verdict analysis
  loadVerdictAI(d);
}

function startOver(){
  document.getElementById('results').style.display='none';
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
    btn.innerHTML = '<span class="ai-icon">✦</span> Why?';
    return;
  }

  panel.classList.add('open');
  openPanels.add(uid);
  btn.innerHTML = '<span class="ai-icon">✦</span> Close';

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

async function callClaudeAPI(prompt) {
  const response = await fetch('proxy.py', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Token': 'fyntori-x7k2-mQ9p-2026'
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
        <div class="ai-section-ttl">📌 What it means</div>
        <div class="ai-section-body">${j.what}</div>
      </div>
      <div class="ai-section">
        <div class="ai-section-ttl">🔍 Why this happened</div>
        <div class="ai-section-body">${j.why}</div>
      </div>
      <div class="ai-section">
        <div class="ai-section-ttl">⚡ What to do</div>
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
    document.getElementById('verdictAILoading').style.display = 'none';
    const content = document.getElementById('verdictAIContent');
    content.classList.add('ready');
    document.getElementById('vai_problem').innerHTML =
      `<span class="verdict-ai-ttl">🔴 Main Problem</span>${j.problem}`;
    document.getElementById('vai_opportunity').innerHTML =
      `<span class="verdict-ai-ttl">🟢 Main Opportunity</span>${j.opportunity}`;
    document.getElementById('vai_steps').innerHTML =
      `<span class="verdict-ai-ttl">→ Next Steps</span><ul class="verdict-ai-steps">${j.steps.map(s=>`<li>${s}</li>`).join('')}</ul>`;
  } catch(e) {
    document.getElementById('verdictAILoading').innerHTML =
      '<div style="font-size:12px;opacity:.7">AI analysis unavailable.</div>';
  }
}

goTo(1);
