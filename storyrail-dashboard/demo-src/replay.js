/* ---------- Demo replay: backlog story #2 across two applications (library-backend ← library-frontend), on a loop ---------- */
(()=>{
  const S="set", L="log", R="run", M="metric", F="findings", X="security";
  // [seconds, op, ...args] — the same operations the agents send through scripts/storyrail-status.mjs
  const BE="library-backend", FE="library-frontend";
  const APPS=[{id:BE,type:"backend",label:"books API",consumes:[],apiTestsRepo:"library-api-tests"},{id:FE,type:"frontend",label:"catalog app",consumes:[BE],apiTestsRepo:null}];
  const SCRIPT=[
    [0,R,"phase","Requirements"],[0,L,"orchestrator","info","Run started for issue #2: Reserve a book that is on loan"],
    [2,S,"req-fetch","running",20,"Reading issue #2 and its Applications"],
    [4,"apps"],[4,L,"req-fetch","info","Applications: library-backend (API tests in library-api-tests), library-frontend (calls library-backend)"],
    [6,S,"req-fetch","running",70,"Checking the 7 acceptance criteria are testable"],
    [9,S,"req-fetch","done",100,"2 apps · 7 ACs"],[9,L,"req-fetch","ok","Spec written: 7 ACs; contract adds POST/DELETE /api/books/{id}/reservations, copied to the frontend and API tests"],
    [10,R,"phase","Build"],[10,L,"orchestrator","info","Build: both apps at the same time, the frontend against the new contract"],
    [11,S,"dev@"+FE,"running",10,"Reading the spec and the BookRow component"],[11,S,"dev@"+BE,"running",10,"Reading the spec and the Book entity"],
    [16,S,"dev@"+FE,"running",40,"Reserve button and queue position"],[16,S,"dev@"+BE,"running",45,"Reservation entity, queue per book"],
    [17,L,"dev@"+BE,"info","Reservation entity and repository done, 14 tests green"],
    [22,S,"dev@"+FE,"running",75,"Tests for the full-queue and error states"],[22,S,"dev@"+BE,"running",80,"POST and DELETE reservations, 409 when already reserved"],
    [26,S,"dev@"+BE,"done",100,"33 tests · mvn verify green · JaCoCo 91%"],[26,M,"unit@"+BE,33,33],[26,L,"dev@"+BE,"ok","Endpoints done: 201, 409 when you already reserved, 404 for unknown books"],
    [28,S,"dev@"+FE,"done",100,"26 tests · 97% lines"],[28,M,"unit@"+FE,26,26],[28,L,"dev@"+FE,"ok","Reserve button done, API mocked from the contract; new test ids: reserve-button, queue-position"],
    [29,R,"phase","Isolated tests"],
    [30,S,"tests@"+FE,"running",15,"Planning UI tests for FE-AC1 to FE-AC3"],[30,S,"tests@"+BE,"running",15,"Writing @BE-AC4 to @BE-AC7 scenarios"],
    [36,S,"tests@"+FE,"running",70,"Running 10 new tests on the mocked API"],[36,S,"tests@"+BE,"running",65,"Running 14 new scenarios on the local backend"],
    [41,S,"tests@"+BE,"done",100,"14 scenarios · 4 ACs · 5 @qa"],[41,M,"api@"+BE,132,132],[41,L,"tests@"+BE,"ok","132 scenarios green on the local backend, 5 new ones tagged @qa"],
    [43,S,"tests@"+FE,"done",100,"10 tests · 3 ACs"],[43,M,"ui@"+FE,83,83],[43,L,"tests@"+FE,"ok","83 UI tests green, including axe and 360 px checks"],
    [44,R,"phase","Review + scan"],
    [45,S,"reviewer","running",20,"Round 1: reading the diffs of 3 repos"],[45,S,"gate","running",20,"Lint, Semgrep, gitleaks, npm audit"],
    [51,S,"gate","done",100,"2 minor findings · 6/6 tools"],[51,X,0,0],[51,L,"gate","warn","S1-01, S1-02 (minor): magic number in the queue size, duplicated date format"],
    [54,S,"reviewer","done",100,"CHANGES_REQUESTED · 0 / 1 / 3"],[54,F,0,1,5,0],
    [54,L,"reviewer","warn","R1-01 (major, library-frontend): the queue position isn't announced to screen readers"],
    [55,R,"phase","Fix"],[56,S,"fixer","running",20,"Fixing 6 findings across 2 apps"],
    [60,S,"fixer","running",70,"Live region and a regression test for R1-01"],
    [63,S,"fixer","done",100,"6/6 fixed · 0 disputed"],[63,F,0,0,0,6],[63,L,"fixer","ok","All 6 findings fixed, 3 regression tests added"],
    [64,R,"phase","Review + scan"],[64,S,"reviewer","running",50,"Round 2: checking the fixes"],[64,S,"gate","running",50,"Round 2: re-scanning"],
    [67,S,"gate","done",100,"0 findings · 6/6 tools"],[68,S,"reviewer","done",100,"APPROVE · 0 / 0 / 0"],[68,L,"reviewer","ok","Round 2: APPROVE, every AC met and tested"],
    [69,R,"phase","CI/CD"],[69,S,"cicd","running",10,"Opening PRs in 3 repos"],
    [74,S,"cicd","waiting",40,"PRs green: backend #12, API tests #8, frontend #15. Merge?"],[74,L,"cicd","info","All checks green; waiting for the product owner to approve the merge"],
    [79,S,"cicd","running",60,"Merging in dependency order: backend, API tests, frontend"],[79,L,"orchestrator","info","Laurence approved the merge"],
    [86,S,"cicd","done",100,"3 PRs merged · deployed to QA"],[86,L,"cicd","ok","library-backend on Render, library-frontend on GitHub Pages"],
    [87,R,"phase","QA"],[87,S,"smoke","running",50,"Checking every QA deploy"],[90,S,"smoke","done",100,"QA site and API alive"],
    [91,S,"qa-api","running",30,"Running 43 @qa scenarios on the QA API"],[96,S,"qa-api","done",100,"43/43 @qa scenarios green on QA"],[96,L,"qa-api","ok","API acceptance on QA: 43/43 green"],
    [97,S,"manual-tests","running",15,"Reserving books on QA"],[103,S,"manual-tests","running",65,"Checking 360 px, dark mode and keyboard focus"],
    [109,S,"manual-tests","done",100,"15 cases · 0 blocker/major · 1 low"],[109,L,"manual-tests","warn","D01 (low): the queue position wraps awkwardly at 360 px; backlog"],
    [110,R,"phase","Sign-off"],[110,S,"signoff","waiting",0,"Your decision"],[110,L,"orchestrator","info","Story ready for sign-off"],
    [118,S,"signoff","done",100,"Approved"],[118,R,"phase","Done"],[118,L,"orchestrator","ok","Laurence signed off #2; issue closed, D01 in the backlog"],
    [118,"end"]
  ];
  const LOOP=132; const STATIONS=["req-fetch","reviewer","gate","fixer","cicd","smoke","qa-api","manual-tests","signoff"];
  let start=0, next=0, feed=[];
  function reset(){
    state=Object.fromEntries(STATIONS.map(s=>[s,{status:"pending",progress:0,note:""}]));
    run={issues:[2],title:"Reserve a book that is on loan",repo:"storyrail-squad/squad-backlog",phase:"Requirements",startedAt:new Date().toISOString(),metrics:{}};
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
    else if(op==="apps"){ run.apps=APPS.map(x=>({...x})); APPS.forEach(x=>["dev","tests"].forEach(k=>{ state[k+"@"+x.id]={status:"pending",progress:0,note:""}; })); }
    else if(op===F) run.metrics.review={blocker:a,major:b,minor:c,fixed:d};
    else if(op===X) run.metrics.security={vulns:a,lint:b};
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
