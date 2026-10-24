/* Demo chat: squad members answer from their status and log in the replay. */
function recordsAnswer(m){
  const ms=memberState(m); const lines=[];
  if(m.kind==="lead") lines.push(run.startedAt?"We're in the "+(run.phase||"first")+" phase of “"+(run.title||"this story")+"”.":"No story is running right now.");
  ms.per.forEach(p=>lines.push("My "+STATION_NAME[p.id]+" step is "+({pending:"not started yet",running:"in progress",done:"done",failed:"failed",waiting:"waiting for you",skipped:"not needed this run"}[p.status]||p.status)+(p.status==="running"&&p.progress?" ("+p.progress+"%)":"")+(p.note?": "+p.note:".")));
  const ids=new Set(memberStations(m)); if(m.kind==="lead") ids.add("orchestrator");
  const notes=demoNotes(m); if(notes.length) lines.push((memberStations(m).includes("reviewer")?"From my review report":"From my work notes")+":\n"+notes.map(n=>"• "+n).join("\n"));
  else{ const f=(window.__feed||[]).filter(x=>ids.has(x.agent)).slice(-3); if(f.length) lines.push("What I've reported lately:\n"+f.map(x=>"• "+x.msg).join("\n")); }
  return lines.join("\n");
}
$("d-form").addEventListener("submit",e=>{
  e.preventDefault(); const q=$("d-q").value.trim(); const id=openId; if(!q||!id) return;
  const m=squad.find(x=>x.id===id); const data=chatCache[id]||(chatCache[id]={outputs:[],chat:[]});
  data.chat=data.chat.concat({from:"you",text:q,t:new Date().toISOString()},{from:id,text:recordsAnswer(m),t:new Date().toISOString()});
  $("d-q").value=""; renderDrawer(true); $("d-q").focus();
});
