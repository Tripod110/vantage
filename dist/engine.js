'use strict';
const Vantage = (() => {
  const CAP = 20, MIN_BASELINE = 5, API = 'https://api.deadlock-api.com';
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  const mean = xs => { const a=xs.filter(valid);return a.length?a.reduce((s,n)=>s+n,0)/a.length:null; };
  const median = xs => {const a=xs.filter(valid).sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length?(a.length%2?a[i]:(a[i-1]+a[i])/2):null;};
  const metrics = [
    {key:'pace',label:'Early economy',unit:'Souls / min',detail:'Net worth per minute at the snapshot nearest 12 minutes.',quest:'Aim to match your usual early Souls per minute next game.'},
    {key:'lobby',label:'Economy vs. lobby',unit:'Souls',scale:600,detail:'Your net worth minus the average of the other players near 10 minutes.',quest:'Check your Souls against the lobby around 10 minutes next game.'},
    {key:'cs',label:'Creep conversion',unit:'%',detail:'Creep kills divided by possible creeps near 12 minutes.',quest:'Aim for your usual share of available creep kills in the first 12 minutes.'},
    {key:'earlyDeaths',label:'Early deaths',unit:'deaths',lower:true,detail:'Recorded deaths in the first 10 minutes.',quest:'Try to finish the first 10 minutes with fewer deaths than this game.'},
    {key:'damage',label:'Team damage share',unit:'%',descriptive:true,detail:'Your share of team hero damage at the latest snapshot shared by all teammates. Hero and role affect this metric; it does not produce advice.'}
  ];
  function accountId(input){if(!/^\d+$/.test(input.trim()))throw Error('Enter a numeric Steam account ID or SteamID64.');let n=BigInt(input.trim());if(n>=76561197960265728n)n-=76561197960265728n;if(n<=0n||n>4294967295n)throw Error('That Steam ID is outside the supported range.');return String(n);}
  function windowOf(games){if(!Array.isArray(games))return [];return [...new Map(games.filter(g=>g&&/^\d+$/.test(String(g.id))&&valid(g.start)).map(g=>[String(g.id),g])).values()].sort((a,b)=>b.start-a.start||b.id-a.id).slice(0,CAP);}
  function near(stats,t){const a=(stats||[]).filter(s=>valid(s.time_stamp_s));if(!a.length)return null;const p=a.reduce((p,s)=>Math.abs(s.time_stamp_s-t)<Math.abs(p.time_stamp_s-t)?s:p);return Math.abs(p.time_stamp_s-t)<=90?p:null;}
  function profile(raw,id,row){
    const m=raw?.match_info||raw,players=Array.isArray(m?.players)?m.players:[];
    if(m?.match_id!=null&&String(m.match_id)!==String(row.match_id))throw Error('Metadata belongs to a different match.');
    const p=players.find(p=>String(p.account_id)===String(id));if(!p)throw Error('Player missing from match metadata.');
    const clean=q=>[...new Map((Array.isArray(q.stats)?q.stats:[]).filter(s=>valid(s.time_stamp_s)&&s.time_stamp_s>=0&&s.time_stamp_s<=row.match_duration_s).map(s=>[s.time_stamp_s,s])).values()].sort((a,b)=>a.time_stamp_s-b.time_stamp_s);
    const records=players.map(q=>({player:q,team:q.team??q.player_team,stats:clean(q)}));
    const stats=records.find(q=>q.player===p).stats,t12=row.match_duration_s>=720?near(stats,720):null,t10=row.match_duration_s>=600?near(stats,600):null;
    const team=p.team??p.player_team??row.player_team,others=records.filter(q=>q.player!==p),mates=records.filter(q=>q.team===team);
    const completeTeams=records.length===12&&records.filter(q=>q.team===0).length===6&&records.filter(q=>q.team===1).length===6;
    const exact=(q,t)=>q.stats.find(s=>s.time_stamp_s===t),nn=n=>valid(n)&&n>=0;
    const deathRecords=Array.isArray(p.death_details)?p.death_details:null;
    const candidateDeaths=deathRecords?.map(d=>d.game_time_s);
    const deaths=candidateDeaths&&candidateDeaths.length===row.player_deaths&&candidateDeaths.every(t=>nn(t)&&t<=row.match_duration_s)?candidateDeaths.sort((a,b)=>a-b):null;
    const lobby=t10?others.map(q=>exact(q,t10.time_stamp_s)?.net_worth):[];
    const damageSnapshot=completeTeams?[...stats].reverse().find(s=>mates.every(q=>nn(exact(q,s.time_stamp_s)?.player_damage))):null;
    const totalDamage=damageSnapshot?mates.reduce((sum,q)=>sum+exact(q,damageSnapshot.time_stamp_s).player_damage,0):0;
    const series=stats.filter(s=>nn(s.net_worth)).map(s=>[s.time_stamp_s,s.net_worth]);
    return {id:row.match_id,start:row.start_time,hero:row.hero_id,gameMode:row.game_mode??null,win:[0,1].includes(row.player_team)&&[0,1].includes(row.match_result)?row.player_team===row.match_result:null,k:row.player_kills,d:row.player_deaths,a:row.player_assists,duration:row.match_duration_s,souls:row.net_worth,ready:series.length>0,schema:2,
      paceTime:t12?.time_stamp_s??null,lobbyTime:t10?.time_stamp_s??null,damageTime:damageSnapshot?.time_stamp_s??null,
      pace:t12&&nn(t12.net_worth)&&t12.time_stamp_s>0?t12.net_worth/(t12.time_stamp_s/60):null,
      lobby:completeTeams&&t10&&nn(t10.net_worth)&&lobby.every(nn)?t10.net_worth-mean(lobby):null,
      cs:t12?.possible_creeps>0&&nn(t12.creep_kills)&&t12.creep_kills<=t12.possible_creeps?100*t12.creep_kills/t12.possible_creeps:null,
      earlyDeaths:deaths&&row.match_duration_s>=600?deaths.filter(t=>t<=600).length:null,
      damage:totalDamage>0?100*damageSnapshot.player_damage/totalDamage:null,deaths,series,
      lead:completeTeams?stats.map(s=>{const all=records.map(q=>({team:q.team,v:exact(q,s.time_stamp_s)?.net_worth}));return all.every(q=>nn(q.v))?[s.time_stamp_s,all.reduce((n,q)=>n+(q.team===team?q.v:-q.v),0)]:null;}).filter(Boolean):[]};
  }
  function migrate(g){
    if(g.schema===2)return g;
    const series=Array.isArray(g.series)?g.series:[],at=t=>near(series.map(p=>({time_stamp_s:p[0]})),t)?.time_stamp_s??null;
    const deaths=Array.isArray(g.deaths)&&g.deaths.length===g.d&&g.deaths.every(t=>valid(t)&&t>=0&&t<=g.duration)?g.deaths:null;
    return {...g,schema:2,legacyTiming:true,series,deaths,paceTime:g.duration>=720?at(720):null,lobbyTime:null,damageTime:null,
      pace:g.duration>=720?g.pace:null,cs:g.duration>=720&&g.cs>=0&&g.cs<=100?g.cs:null,lobby:null,damage:null,
      earlyDeaths:deaths&&g.duration>=600?deaths.filter(t=>t<=600).length:null};
  }
  function peers(game,games){return windowOf(games).filter(g=>String(g.id)!==String(game.id)&&g.ready&&(game.gameMode==null?g.gameMode==null:g.gameMode===game.gameMode));}
  function compare(game,games){const other=peers(game,games);return metrics.map(m=>{const values=other.map(g=>g[m.key]).filter(valid),base=median(values),value=game[m.key];let delta=valid(value)&&valid(base)?value-base:null;const scale=m.scale??Math.max(Math.abs(base||0),m.lower?1:.001),score=delta===null?null:delta/scale*(m.lower?-1:1),threshold=m.scale?1:.1;return {...m,value,base,n:values.length,delta,score,state:score===null?'unavailable':values.length<MIN_BASELINE?'small sample':score>threshold?'above':score< -threshold?'below':'typical'};});}
  function focus(game,rows){
    if(!game.ready)return {headline:'This match needs more data.',detail:'Its summary is available, but detailed snapshots are missing. Refresh to retry.',quest:null};
    const gap=rows.filter(r=>!r.descriptive&&r.state==='below').sort((a,b)=>a.score-b.score)[0];
    if(!gap){const measured=rows.filter(r=>!r.descriptive&&valid(r.value));
      if(!measured.length)return {headline:'Not enough measured data.',detail:'The recorded fields do not support a coaching comparison for this match.',quest:null};
      if(measured.every(r=>r.n<MIN_BASELINE)){const available=Math.max(0,...measured.map(r=>r.n)),label=`${available} recent match${available===1?'':'es'}`;return {headline:'A little more context is needed.',detail:`This match has usable measurements, but the largest comparable baseline is ${label}. Coaching needs at least ${MIN_BASELINE} in this window and game mode. The table still shows the measured values.`,quest:null};}
      return {headline:'No clear shortfall in the available metrics.',detail:'The available coaching metrics did not fall outside their comparison bands. This is not a verdict on your overall performance.',quest:null};}
    const n=v=>v.toLocaleString(undefined,{maximumFractionDigits:Number.isInteger(v)?0:1}),measurement=(v,r)=>r.key==='earlyDeaths'?`${n(v)} death${v===1?'':'s'}`:`${n(v)} ${r.unit}`;
    const quest=gap.key==='earlyDeaths'?'Aim for fewer early deaths than this match in your next game.':gap.key==='pace'?`Check your economy around 12 minutes next game against your recent ${n(gap.base)} Souls per minute.`:gap.key==='cs'?`Use your recent ${n(gap.base)}% creep conversion as a reference for the first 12 minutes next game.`:`Around 10 minutes next game, compare your lobby gap with your recent median of ${gap.base>=0?'+':'−'}${n(Math.abs(gap.base))} Souls.`;
    return {gap,headline:gap.lower?'More early deaths than your recent median.':`${gap.label} was lower than your recent median.`,detail:`${measurement(gap.value,gap)} this game; a median of ${measurement(gap.base,gap)} across ${gap.n} recent match${gap.n===1?'':'es'}. This measured difference does not explain the result.`,quest};
  }
  function moments(g){const out=[];if(g.deaths){let best=[];for(const t of g.deaths){const group=g.deaths.filter(d=>d>=t&&d<=t+360);if(group.length>best.length)best=group;}if(best.length>=3)out.push({t:best[0],title:'Deaths close together',body:`${best.length} recorded deaths between ${time(best[0])} and ${time(best.at(-1))}. The data does not show why they happened.`});}
    let swing=null;for(let i=0;i<(g.lead||[]).length;i++)for(let j=i+1;j<g.lead.length;j++){const d=g.lead[j][1]-g.lead[i][1];if(!swing||Math.abs(d)>Math.abs(swing.d))swing={a:g.lead[i][0],t:g.lead[j][0],d};}if(swing&&Math.abs(swing.d)>=2500)out.push({t:swing.a,title:'Team economy swing',body:`Your team’s Souls lead ${swing.d>0?'increased':'decreased'} by ${Math.round(Math.abs(swing.d)).toLocaleString()} between ${time(swing.a)} and ${time(swing.t)}. This does not establish a cause.`});
    if(valid(g.lobby)&&Math.abs(g.lobby)>=600&&valid(g.lobbyTime))out.push({t:g.lobbyTime,title:'An early lobby gap',body:`At the ${time(g.lobbyTime)} snapshot, you were ${Math.round(Math.abs(g.lobby)).toLocaleString()} Souls ${g.lobby>0?'above':'below'} the other players’ average.`});return out.sort((a,b)=>a.t-b.t).slice(0,4);}
  function time(t){return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
  function interpolate(series,t){if(!series?.length||t<series[0][0]||t>series.at(-1)[0])return null;for(let i=0;i<series.length;i++){if(series[i][0]===t)return series[i][1];if(series[i][0]>t){const a=series[i-1],b=series[i];return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}}return null;}
  async function fetchJSON(path){let r;try{r=await fetch(API+path,{signal:AbortSignal.timeout(20000)});}catch{throw Error('Could not reach the data service. Check your connection and try again.');}if(!r.ok){const e=Error(r.status===429?'The data service is busy. Wait a moment, then refresh.':`The data service returned ${r.status}. Try again shortly.`);e.status=r.status;throw e;}return r.json();}
  const storage={read(k,fallback=null){try{return JSON.parse(localStorage.getItem('vantage:desk:'+k))??fallback;}catch{return fallback;}},write(k,v){try{localStorage.setItem('vantage:desk:'+k,JSON.stringify(v));return true;}catch{return false;}}};
  async function sync(id,cached,onProgress=()=>{}){
    const history=await fetchJSON(`/v1/players/${id}/match-history`);
    if(!Array.isArray(history)||history.some(r=>!r||!/^\d+$/.test(String(r.match_id))||!valid(r.start_time)))throw Error('The match list was not available. Your saved window has been kept.');
    const rows=[...new Map(history.map(r=>[String(r.match_id),r])).values()].sort((a,b)=>b.start_time-a.start_time||b.match_id-a.match_id).slice(0,CAP),old=new Map(windowOf(cached).filter(g=>g.ready).map(g=>[String(g.id),migrate(g)]));
    let cursor=0,done=0,failed=0,rateLimited=false;const result=new Array(rows.length);
    await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length){
      const i=cursor++,r=rows[i];let g=old.get(String(r.match_id));
      if(g)g={...g,gameMode:r.game_mode??null};
      else if(!rateLimited){try{g=profile(await fetchJSON(`/v1/matches/${r.match_id}/metadata`),id,r);}catch(e){if(e.status===429)rateLimited=true;}}
      if(!g)g={id:r.match_id,start:r.start_time,hero:r.hero_id,gameMode:r.game_mode??null,win:[0,1].includes(r.player_team)&&[0,1].includes(r.match_result)?r.player_team===r.match_result:null,k:r.player_kills,d:r.player_deaths,a:r.player_assists,duration:r.match_duration_s,souls:r.net_worth,ready:false,series:[],lead:[]};
      if(!g.ready)failed++;result[i]=g;onProgress(++done,rows.length);
    }}));return {games:windowOf(result),failed,rateLimited};
  }
  return {CAP,MIN_BASELINE,metrics,mean,median,valid,accountId,windowOf,profile,migrate,peers,compare,focus,moments,time,interpolate,fetchJSON,storage,sync};
})();
if(typeof module!=='undefined')module.exports=Vantage;
