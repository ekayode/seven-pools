/* Seven Pools: screens, timing and audio. Content comes from content/days.json; recorded voice from audio/clips.json. */
const $=id=>document.getElementById(id);
let DATA=null, DAYS=[], SETTLE=10, todayIdx=0, CLIPS=null;
let cur=0, segs=[], segI=-1, segElapsed=0, running=false, inSession=false, done=false, last=0, timer=null, wake=null, ctx=null, lastPhase=-1, tickAcc=0;
const prefs={voice:true,tones:true};
try{const p=JSON.parse(localStorage.getItem("sp-prefs")||"{}");Object.assign(prefs,p)}catch(e){}
const canSpeak="speechSynthesis" in window;
const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;

// The five steps of every sit. All the teaching comes first; then a long silent meditation and a short seal.
// lines: [seconds into the step, ...keys] — the keys are spoken one after another from that point.
function SEGS(d){
  const T=DATA.timeline,G=DATA.guideSeconds||12;
  return [
   {key:"intention",name:"Intention",dur:T.intention,q:true,pre:`${DATA.common.arrive} ${d.say.today}`,read:d.ask,
    lines:[[2,"arrive","today","ask","hold_q"]]},
   {key:"breath",name:d.breath.name,dur:T.breath,read:d.breath.read,pattern:d.breath.pattern,guideUntil:T.breath-G,
    lines:[[0,"intro"],...(d.breath.lines||[]),[T.breath-G,"on_your_own"]]},
   {key:"pool",name:"The pool",dur:T.pool,read:d.say.pool.replace(/\.\.\./g,","),lines:[[1,"pool"]]},
   {key:"sit",name:"Meditation",dur:T.meditation,bell:true,
    read:`Silence, with two brief check-ins from the guru (around ${DATA.checkins.map(s=>fmt(s)).join(" and ")}) on the breath, the pool and your question. When a thought pulls you away, notice it and return to the breath.`,
    lines:[[3,"meditate"],...DATA.checkins.map((s,k)=>[s,"checkin_"+(k+1)])]},
   {key:"seal",name:"Seal",dur:T.seal,bell:true,read:d.seal,lines:[[3,"seal_intro","seal"]]}
  ];
}

function dateKey(){const n=new Date();return n.getFullYear()+"-"+(n.getMonth()+1)+"-"+n.getDate()}
function readCount(){try{return +(localStorage.getItem("sp-"+dateKey())||0)}catch(e){return 0}}
function addCount(){try{localStorage.setItem("sp-"+dateKey(),readCount()+1)}catch(e){} showCount()}
function showCount(){const n=readCount();$("count").textContent=n?`${n} session${n>1?"s":""} today`:"No session yet today"}
function savePrefs(){try{localStorage.setItem("sp-prefs",JSON.stringify(prefs))}catch(e){}}
function syncToggles(){const can=!!CLIPS||canSpeak;$("tVoice").setAttribute("aria-pressed",prefs.voice&&can);$("tTones").setAttribute("aria-pressed",prefs.tones);
  if(!can){$("tVoice").disabled=true;$("voiceNote").textContent="Voice guidance isn't available on this device. You'll get bells and breath tones only."}}
const fmtDur=s=>s<60?`${s} sec`:s%60?`${Math.floor(s/60)} min ${s%60} sec`:`${s/60} min`;

function renderDays(){
  $("days").innerHTML=DAYS.map((d,i)=>`<button class="day${i===todayIdx?" today":""}" style="--c:${d.c}" aria-pressed="${i===cur}" data-i="${i}"><small>${d.short}</small><i class="dot"></i><span>${d.el}</span></button>`).join("");
}
function selectDay(i){
  cur=i;const d=DAYS[i];document.documentElement.style.setProperty("--chakra",d.c);renderDays();
  $("poolEyebrow").textContent=`${i===todayIdx?"Today · ":""}${d.short} · ${d.skt}`;
  $("poolTitle").innerHTML=`The <em>${d.el}</em> pool`;
  $("fWhere").textContent=d.where;$("fDeals").textContent=d.deals;$("fBlock").textContent=d.block;$("fBija").textContent=d.bija;
  $("release").textContent=d.release;
  $("teach").innerHTML=`<b>If you teach this</b>${d.teach}`;
  $("barNote").textContent=`${d.el} · ${d.where.split(",")[0]}`;
  segs=SEGS(d);done=false;drawClock();
  $("steps").innerHTML=segs.map((s,k)=>`<li><span class="n">${k+1}</span><span class="t">${s.name}</span><span class="m">${fmtDur(s.dur)}</span>${s.q?`<span class="d">${s.pre}</span><span class="q">“${s.read}”</span><span class="hear">Hold it lightly as your intention for the sit.</span>`:`<span class="d">${s.read}</span>`}</li>`).join("");
}

/* ---------- countdown ---------- */
const RING=339.29; // circumference of the r=54 ring
const fmt=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const total=()=>segs.reduce((a,s)=>a+s.dur,0);
function timeLeft(){if(!inSession)return done?0:total();if(segI<0)return total();
  let r=segs[segI].dur-segElapsed;for(let k=segI+1;k<segs.length;k++)r+=segs[k].dur;return r}
function drawClock(){
  const l=timeLeft(),t=fmt(l);let now;
  if(!inSession)now=done?"Complete. Carry the seal with you.":`Ready · ${segs.length} steps`;
  else if(segI<0)now=`Settling · starts in ${fmt(SETTLE-segElapsed)}`;
  else now=`${segs[segI].name} · ${fmt(segs[segI].dur-segElapsed)} left`;
  const sub=inSession&&segI>=0?`Step ${segI+1} of ${segs.length} · ${now}`:now;
  if($("clockTime").textContent!==t){$("clockTime").textContent=t;$("sitClock").textContent=t}
  if($("clockSub").textContent!==sub)$("clockSub").textContent=sub;
  if($("sitSub").textContent!==now)$("sitSub").textContent=now;
  const off=RING*(1-l/total());$("ringProg").style.strokeDashoffset=off;$("sitRing").style.strokeDashoffset=off;
}

/* ---------- audio: bells and tones ---------- */
// "playback" lets Safari play through the silent switch (iOS 17+).
try{if(navigator.audioSession)navigator.audioSession.type="playback"}catch(e){}
function ac(){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.state!=="running")ctx.resume()}catch(e){}return ctx}
function bell(n=1,delay=0){const c=ac();if(!c)return;
  for(let r=0;r<n;r++){const t0=c.currentTime+delay+r*1.6;
    [[220,.2],[330,.08],[607,.05]].forEach(([f,v])=>{const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=f;
      g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v,t0+.02);g.gain.exponentialRampToValueAtTime(.0001,t0+4.5);
      o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+4.6)})}}
function tone(type,dur){ // inhale rises, exhale falls; holds are silent
  if(!prefs.tones)return;const c=ac();if(!c)return;const t0=c.currentTime;
  if(type==="tick"){const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=520;g.gain.setValueAtTime(.05,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+.12);o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+.15);return}
  if(type!=="in"&&type!=="out")return;
  const o=c.createOscillator(),g=c.createGain();o.type="sine";
  const lo=174,hi=261;o.frequency.setValueAtTime(type==="in"?lo:hi,t0);o.frequency.linearRampToValueAtTime(type==="in"?hi:lo,t0+dur);
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.05,t0+.4);g.gain.setValueAtTime(.05,t0+dur-.5);g.gain.linearRampToValueAtTime(0,t0+dur);
  o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+dur+.05)}

/* ---------- audio: the voice ---------- */
// Each spoken line is a recording (audio/<id>.mp3). Until recordings exist, the device's own voice reads the same text.
const GAP=1.8; // seconds of quiet between consecutive lines
const buffers={}, voiceQ=[];
let speaking=false, gapTimer=null, curSrc=null, rot={in:0,out:0};
function clipId(key,d=DAYS[cur]){
  if(key==="in"||key==="out"){const k=`${key}_${"abc"[rot[key]++%3]}`;return "common-"+k}
  return d.say[key]!=null?`${d.short.toLowerCase()}-${key}`:"common-"+key}
function clipText(id){const [p,...rest]=id.split("-"),key=rest.join("-");
  if(p==="common")return DATA.common[key];const d=DAYS.find(x=>x.short.toLowerCase()===p);return d&&d.say[key]}
function dayClipIds(d){return [...Object.keys(DATA.common).map(k=>"common-"+k),...Object.keys(d.say).map(k=>`${d.short.toLowerCase()}-${k}`)]}
function loadClips(ids){if(!CLIPS)return;const c=ac();if(!c)return;
  ids.forEach(id=>{const meta=CLIPS.clips[id];if(!meta||buffers[id])return;buffers[id]="loading";
    fetch("audio/"+meta.file).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(b=>c.decodeAudioData(b)).then(buf=>buffers[id]=buf).catch(()=>{delete buffers[id]})})}
let deviceVoice=null;
function pickVoice(){if(!canSpeak)return;const vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang));
  deviceVoice=vs.find(v=>/Samantha|Daniel|Google UK English Male|Karen|Moira|Serena/i.test(v.name))||vs[0]||null}
if(canSpeak){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function playClip(id,doneFn){
  doneFn=doneFn||(()=>{});
  if(!prefs.voice){doneFn();return}
  const buf=buffers[id];
  if(buf&&buf!=="loading"){const c=ac(),s=c.createBufferSource(),g=c.createGain();g.gain.value=1;s.buffer=buf;s.connect(g).connect(c.destination);
    curSrc=s;s.onended=()=>{if(curSrc===s){curSrc=null;doneFn()}};s.start();return}
  const text=clipText(id);
  if(!canSpeak||!text){doneFn();return}
  try{let fired=false;const fin=()=>{if(!fired){fired=true;doneFn()}};
    const u=new SpeechSynthesisUtterance(text.replace(/\.\.\./g,","));if(deviceVoice)u.voice=deviceVoice;u.rate=.8;u.pitch=.95;u.onend=fin;
    speechSynthesis.speak(u);setTimeout(fin,text.length*85+2500)} // onend can fail to fire on iOS
  catch(e){doneFn()}
}
function speak(ids){voiceQ.push(...ids);if(!speaking)nextLine()}
function nextLine(){
  const id=voiceQ.shift();
  if(!id){speaking=false;onVoiceIdle();return}
  speaking=true;playClip(id,()=>{gapTimer=setTimeout(nextLine,GAP*1000)});
}
function stopVoice(){voiceQ.length=0;clearTimeout(gapTimer);speaking=false;
  if(curSrc){const s=curSrc;curSrc=null;try{s.stop()}catch(e){}}try{speechSynthesis.cancel()}catch(e){}}
// Breath pacing waits for the breath's spoken introduction to finish.
function onVoiceIdle(){const seg=segs[segI];if(seg&&seg.pattern&&seg.paceFrom==null&&running)seg.paceFrom=segElapsed+.5}

/* ---------- session ---------- */
function keepAwake(){try{navigator.wakeLock&&navigator.wakeLock.request("screen").then(w=>wake=w).catch(()=>{})}catch(e){}}
function phaseIdx(seg,t){const len=seg.pattern.reduce((a,p)=>a+p[1],0);let x=t%len,k=0,cyc=Math.floor(t/len);
  for(;k<seg.pattern.length;k++){if(x<seg.pattern[k][1])break;x-=seg.pattern[k][1]}return cyc*100+k}
function enterSeg(i){segI=i;segElapsed=0;lastPhase=-1;tickAcc=0;rot={in:0,out:0};
  const s=segs[i];s.fired=0;s.paceFrom=null;
  if(s.bell)bell(1);$("sitStep").textContent=`Step ${i+1} of ${segs.length}`}
function begin(){
  ac();loadClips(dayClipIds(DAYS[cur]));stopVoice();
  $("sit").hidden=false;$("sitLive").hidden=false;$("paused").hidden=true;$("sitStep").textContent="Settling";
  segI=-1;segElapsed=0;inSession=true;done=false;run();keepAwake();drawClock();
  setTimeout(()=>{if(running&&segI<0)speak(["common-settle"])},600);
}
function run(){running=true;last=performance.now();clearInterval(timer);timer=setInterval(()=>{tick();drawClock()},100)}
function tick(){
  const now=performance.now(),dt=Math.min((now-last)/1000,1);last=now;segElapsed+=dt;
  if(segI===-1){if(segElapsed>=SETTLE){bell(1);enterSeg(0)}return}
  const seg=segs[segI];
  if(segElapsed>=seg.dur){if(segI<segs.length-1){enterSeg(segI+1)}else{finish()}return}
  // Spoken lines scheduled for this step.
  while(seg.fired<seg.lines.length&&segElapsed>=seg.lines[seg.fired][0]){
    const [,...keys]=seg.lines[seg.fired++];speak(keys.map(k=>clipId(k)))}
  // Breath pacing: a tone and a soft spoken cue at each phase.
  if(seg.pattern){
    if(seg.paceFrom==null&&segElapsed>25)seg.paceFrom=segElapsed; // in case the introduction never reports finishing
    if(seg.paceFrom!=null&&segElapsed>=seg.paceFrom){
      const pi=phaseIdx(seg,segElapsed-seg.paceFrom),p=seg.pattern[pi%100];
      if(pi!==lastPhase){lastPhase=pi;tone(p[0],p[1]);if(!speaking&&segElapsed<seg.guideUntil)playClip(clipId(p[2]))}
      if(p[0]==="pump"){tickAcc+=dt;if(tickAcc>=.9){tickAcc=0;tone("tick")}}
    }
  }
}
function finish(){stop();stopVoice();inSession=false;done=true;bell(3);setTimeout(()=>playClip("common-complete"),4200);addCount();
  setTimeout(()=>{$("sit").hidden=true},7500)}
function stop(){running=false;clearInterval(timer);timer=null;try{wake&&wake.release()}catch(e){}wake=null}
function pause(why){if(!running)return;stop();stopVoice();$("sitLive").hidden=true;$("paused").hidden=false;
  const s=segI<0?"settling":`step ${segI+1}, ${segs[segI].name}`;$("pausedNote").textContent=(why||"Paused")+` during ${s}`}

$("begin").onclick=begin;
$("sit").onclick=e=>{if(e.target.closest("#paused"))return;pause()};
$("resume").onclick=()=>{ac();$("paused").hidden=true;$("sitLive").hidden=false;run();keepAwake()};
$("end").onclick=()=>{stop();stopVoice();inSession=false;drawClock();$("sit").hidden=true};
$("tVoice").onclick=()=>{prefs.voice=!prefs.voice;savePrefs();syncToggles()};
$("tTones").onclick=()=>{prefs.tones=!prefs.tones;savePrefs();syncToggles()};
$("test").onclick=()=>{ac();loadClips(["common-test"]);bell(1);setTimeout(()=>tone("in",3),600);setTimeout(()=>tone("out",3),3700);
  setTimeout(()=>{stopVoice();speak(["common-test"])},900)};
$("days").onclick=e=>{const b=e.target.closest(".day");if(b)selectDay(+b.dataset.i)};
// Timers stop when the phone locks, so pause cleanly instead of skipping ahead.
document.addEventListener("visibilitychange",()=>{if(document.hidden&&running)pause("Paused (screen locked or app left)")});

Promise.all([
  fetch("content/days.json").then(r=>r.json()),
  fetch("audio/clips.json").then(r=>r.ok?r.json():null).catch(()=>null)
]).then(([data,clips])=>{
  DATA=data;DAYS=data.days;SETTLE=data.settleSeconds||10;CLIPS=clips&&clips.clips?clips:null;
  todayIdx=DAYS.findIndex(d=>d.dow===new Date().getDay());cur=todayIdx;
  showCount();syncToggles();selectDay(cur);
});

if(!standalone&&/iPhone|iPad|iPod/.test(navigator.userAgent))$("install").classList.add("show");
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
