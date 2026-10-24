/* ---------- Demo replay: story #1 across three applications (INSU-ta01 ← INSU-fa01 ← INSU-sp01), on a loop ---------- */
(()=>{
  const S="set", L="log", R="run", M="metric", F="findings", X="security";
  // [seconds, op, ...args] — the same operations the agents send through scripts/storyrail-status.mjs
  const TA="INSU-ta01", FA="INSU-fa01", SP="INSU-sp01";
  const APPS=[{id:TA,type:"backend",label:"task API",consumes:[]},{id:FA,type:"backend",label:"facade API",consumes:[TA]},{id:SP,type:"frontend",label:"frontend",consumes:[FA]}];
  const SCRIPT=[
    [0,R,"phase","Requirements"],[0,L,"orchestrator","info","Run started for issue #1: Task info on the screen"],
    [2,S,"req-fetch","running",20,"Reading #1, its Applications and documents"],
    [4,"apps"],[4,L,"req-fetch","info","Found INSU-ta01 (backend), INSU-fa01 (backend, calls ta01), INSU-sp01 (frontend, calls fa01)"],
    [6,S,"req-fetch","running",60,"Contracts: INSU-ta01 first, then INSU-fa01"],
    [8,S,"req-fetch","waiting",80,"1 question for you"],[8,L,"req-fetch","warn","The API document doesn't say what INSU-fa01 returns when INSU-ta01 has no info: 404 or empty?"],
    [11,L,"orchestrator","info","You answered: 404 \"Task info not found\". Posted on #1"],
    [12,S,"req-fetch","done",100,"3 apps · 9 ACs"],[12,L,"req-fetch","ok","Spec: 3 ACs per app; ta01 and fa01 contracts updated, copies in fa01 and sp01"],
    [13,R,"phase","Build"],[13,L,"orchestrator","info","Build: all 3 apps at the same time, each against the contracts"],
    [14,S,"dev@"+TA,"running",10,"Reading the spec and the API document"],[14,S,"dev@"+FA,"running",10,"Reading the spec and ta01's contract"],[14,S,"dev@"+SP,"running",10,"Reading the Screen document"],
    [19,S,"dev@"+TA,"running",50,"Task info query + GET /tasks/{id}/info"],[19,S,"dev@"+FA,"running",50,"TaskInfoClient from ta01's contract, WireMock stub"],[19,S,"dev@"+SP,"running",45,"Info screen from the Screen document"],
    [24,S,"dev@"+TA,"done",100,"18 tests · verify green"],[24,M,"unit@"+TA,18,18],[24,L,"dev@"+TA,"ok","INSU-ta01: GET /tasks/{id}/info done, 404 when the task has no info"],
    [26,S,"dev@"+FA,"done",100,"22 tests · verify green"],[26,M,"unit@"+FA,22,22],[26,L,"dev@"+FA,"ok","INSU-fa01: GET /info/{id} done; ta01's 404 becomes its own 404 problem"],
    [28,S,"dev@"+SP,"done",100,"26 tests · 96% lines"],[28,M,"unit@"+SP,26,26],[28,L,"dev@"+SP,"ok","INSU-sp01: info screen done; new test ids: task-info, task-info-empty"],
    [29,R,"phase","Isolated tests"],
    [30,S,"tests@"+TA,"running",20,"API scenarios on :8081"],[30,S,"tests@"+FA,"running",20,"On :8082, ta01 stubbed on :8182"],[30,S,"tests@"+SP,"running",20,"Playwright, fa01 mocked"],
    [36,S,"tests@"+TA,"running",70,"Running 8 scenarios"],[36,S,"tests@"+FA,"running",65,"Running 10 scenarios incl. ta01 errors"],[36,S,"tests@"+SP,"running",70,"Running 9 tests"],
    [40,S,"tests@"+TA,"done",100,"8 scenarios · 3 ACs"],[40,M,"api@"+TA,8,8],
    [41,S,"tests@"+FA,"done",100,"10 scenarios · 3 ACs"],[41,M,"api@"+FA,10,10],[41,L,"tests@"+FA,"ok","INSU-fa01 green with ta01 stubbed: success, 404, 500 and a timeout"],
    [42,S,"tests@"+SP,"done",100,"9 tests · 3 ACs"],[42,M,"ui@"+SP,9,9],
    [43,R,"phase","Review + scans"],
    [44,S,"reviewer","running",20,"Round 1: 3 diffs and the contracts"],[44,S,"gate","running",15,"Sonar on 3 apps"],
    [48,S,"gate","running",50,"Fortify on ta01 and fa01"],[51,S,"gate","running",80,"NexusIQ on 3 apps"],
    [53,S,"reviewer","done",100,"CHANGES_REQUESTED · 0 / 1 / 2"],[53,L,"reviewer","warn","R1-01 (major, INSU-fa01): a ta01 timeout comes back as 500; the API document says 503"],
    [55,S,"gate","done",100,"2 findings · Sonar 1 · Fortify ok · NexusIQ 1"],[55,"scans",1,0,1],[55,F,0,2,3,0],
    [55,L,"gate","warn","NexusIQ (INSU-sp01): axios 1.6.0 Severe; Sonar (INSU-ta01): SQL built by string concatenation"],
    [56,R,"phase","Fix"],[56,L,"orchestrator","info","Fix round 1: the three apps' developers side by side"],
    [57,S,"fix@"+TA,"running",20,"Fixing 1 finding, round 1"],[57,S,"fix@"+FA,"running",20,"Fixing 2 findings, round 1"],[57,S,"fix@"+SP,"running",20,"Fixing 2 findings, round 1"],
    [60,S,"fix@"+FA,"running",70,"Timeout → 503, regression test"],[60,S,"fix@"+SP,"running",70,"Upgrading axios to 1.7.4"],
    [61,S,"fix@"+TA,"done",100,"1/1 fixed · bound parameters"],[62,S,"fix@"+SP,"done",100,"2/2 fixed · axios 1.7.4"],[63,S,"fix@"+FA,"done",100,"2/2 fixed · 0 disputed"],[63,F,0,0,0,5],
    [64,R,"phase","Re-run tests"],[64,L,"orchestrator","info","Fixes changed all 3 apps: re-running their tests"],
    [64,S,"tests@"+TA,"running",30,"Round 2: re-running the API scenarios"],[64,S,"tests@"+FA,"running",30,"Round 2: re-running, + R1-01 regression"],[64,S,"tests@"+SP,"running",30,"Round 2: re-running the UI tests"],
    [68,S,"tests@"+TA,"done",100,"Round 2: 8/8 green"],[68,S,"tests@"+FA,"done",100,"Round 2: 11/11 green"],[68,M,"api@"+FA,11,11],[68,S,"tests@"+SP,"done",100,"Round 2: 9/9 green"],
    [69,R,"phase","Review + scans"],[69,S,"reviewer","running",50,"Round 2: checking the fixes"],[69,S,"gate","running",40,"Round 2: re-scanning 3 apps"],
    [74,S,"gate","done",100,"0 findings · Sonar ok · Fortify ok · NexusIQ ok"],[74,"scans",0,0,0],
    [75,S,"reviewer","done",100,"APPROVE · 0 / 0 / 0"],[75,L,"reviewer","ok","Round 2: APPROVE, every AC met, contracts used exactly"],
    [76,R,"phase","Release"],[76,S,"cicd","running",10,"Opening 3 merge requests"],
    [80,S,"cicd","waiting",25,"MRs green: INSU-ta01 !21 → INSU-fa01 !34 → INSU-sp01 !47. Merge?"],[80,L,"cicd","info","All MR pipelines green; waiting for your OK to merge"],
    [85,S,"cicd","running",45,"INSU-ta01 merged · CI running"],[85,L,"orchestrator","info","You approved the merge"],
    [89,S,"cicd","running",65,"INSU-fa01 merged · CI running"],[93,S,"cicd","running",85,"INSU-sp01 merged · CI running"],
    [97,S,"cicd","done",100,"3 apps merged · CI green"],[97,L,"cicd","ok","CI green on main: INSU-ta01, then INSU-fa01, then INSU-sp01"],
    [98,R,"phase","Done"],[98,L,"orchestrator","ok","#1 labelled Ready for QA; deploy with CDD in the order ta01, fa01, sp01"],
    [98,"end"]
  ];
  const LOOP=110; const STATIONS=["req-fetch","reviewer","gate","cicd"];
  let start=0, next=0, feed=[];
  function reset(){
    state=Object.fromEntries(STATIONS.map(s=>[s,{status:"pending",progress:0,note:""}]));
    run={issues:[1],title:"Task info on the screen",repo:"https://github.com/storyrail-squad/squad-backlog",phase:"Requirements",startedAt:new Date().toISOString(),metrics:{}};
    feed=[]; next=0; start=performance.now(); feedSeen.clear(); $("feed").innerHTML="";
    ["k-unit","k-api","k-ui","k-rev","k-sec"].forEach(id=>{ $(id).textContent="—"; }); ["kb-unit","kb-api","kb-ui","kb-rev","kb-sec"].forEach(id=>bar(id,0)); $("findings").hidden=true;
    Object.values(chatCache).forEach(c=>{ c.chat=[]; });
  }
  function apply(e){
    const [,op,a,b,c,d,f]=e; const now=new Date().toISOString();
    if(op===S) state[a]={status:b,progress:b==="done"?100:c,note:d||""};
    else if(op===L) feed.push({t:now,agent:a,level:b,msg:c});
    else if(op===R) run[a]=b;
    else if(op===M){ run.metrics.byApp=run.metrics.byApp||{}; run.metrics.byApp[a]={passed:b,total:c};
      ["unit","api","ui"].forEach(k=>{ const p=Object.entries(run.metrics.byApp).filter(([x])=>x.startsWith(k+"@")).map(([,v])=>v); if(p.length) run.metrics[k]=p.reduce((x,y)=>({passed:x.passed+y.passed,total:x.total+y.total}),{passed:0,total:0}); }); }
    else if(op==="apps"){ run.apps=APPS.map(x=>({...x})); APPS.forEach(x=>["dev","tests","fix"].forEach(k=>{ state[k+"@"+x.id]={status:"pending",progress:0,note:""}; })); }
    else if(op===F) run.metrics.review={blocker:a,major:b,minor:c,fixed:d};
    else if(op===X) run.metrics.security={vulns:a,lint:b};
    else if(op==="scans") run.metrics.scans={sonar:a,fortify:b,nexusiq:c};
    else if(op==="end") run.endedAt=now;
  }
  function tick(){
    const t=(performance.now()-start)/1000; let changed=false;
    while(next<SCRIPT.length&&SCRIPT[next][0]<=t){ apply(SCRIPT[next]); next++; changed=true; }
    if(t>LOOP){ reset(); changed=true; }
    if(changed){ window.__feed=feed; renderAgents(); renderRun(); renderFeed(feed); renderSquad(); }
  }
  $("replay").addEventListener("click",()=>{ reset(); tick(); });
  reset(); tick(); setInterval(tick,500);
})();
