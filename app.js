/* Seven Pools: screens, timing and audio. Content comes from content/days.json. */
const $=id=>document.getElementById(id);
let DAYS=[], SETTLE=10, todayIdx=0;
let cur=0, segs=[], segI=-1, segElapsed=0, running=false, inSession=false, done=false, last=0, timer=null, wake=null, ctx=null, lastPhase=-1, midSaid=false, tickAcc=0;
const prefs={voice:true,tones:true};
try{const p=JSON.parse(localStorage.getItem("sp-prefs")||"{}");Object.assign(prefs,p)}catch(e){}
const canSpeak="speechSynthesis" in window;
const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;

// The six steps of every sit, filled in from the day's content.
const SEGS=d=>[
 {name:"Arrive",dur:60,read:`Lengthen the spine, soften the jaw and shoulders, three slow breaths. Find ${d.where.toLowerCase()}.`,say:`Arrive. Sit tall. Soften the jaw and shoulders. Three slow breaths. Today is ${d.el}.`},
 {name:d.breath.name,dur:180,read:d.breath.read,say:d.breath.say,pattern:d.breath.pattern,cues:d.breath.phaseCues},
 {name:"Clear the pool",dur:120,read:d.pool,say:`Clear the pool. Attention at the ${d.where.split(",")[0].toLowerCase()}.`+(d.bija==="Silence"?" No sound today. Let each exhale loosen your hold.":` On each exhale, silently, ${d.bija}.`)},
 {name:"Ask",dur:180,q:true,read:d.ask,say:"Ask, and listen. "+d.ask,mid:"Ask again. "+d.ask},
 {name:"Stillness",dur:120,read:"Drop the technique and the question. Just sit. When a thought pulls you, notice it and return to the breath.",say:"Stillness. Let the question go. Just sit."},
 {name:"Seal",dur:60,read:d.seal,say:"Seal. "+d.seal}
];

function dateKey(){const n=new Date();return n.getFullYear()+"-"+(n.getMonth()+1)+"-"+n.getDate()}
function readCount(){try{return +(localStorage.getItem("sp-"+dateKey())||0)}catch(e){return 0}}
function addCount(){try{localStorage.setItem("sp-"+dateKey(),readCount()+1)}catch(e){} showCount()}
function showCount(){const n=readCount();$("count").textContent=n?`${n} session${n>1?"s":""} today`:"No session yet today"}
function savePrefs(){try{localStorage.setItem("sp-prefs",JSON.stringify(prefs))}catch(e){}}
function syncToggles(){$("tVoice").setAttribute("aria-pressed",prefs.voice&&canSpeak);$("tTones").setAttribute("aria-pressed",prefs.tones);
  if(!canSpeak){$("tVoice").disabled=true;$("voiceNote").textContent="Voice cues aren't available on this device. You'll get bells and breath tones only."}}

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
  $("steps").innerHTML=segs.map((s,k)=>`<li><span class="n">${k+1}</span><span class="t">${s.name}</span><span class="m">${s.dur/60} min</span>${s.q?`<span class="q">“${s.read}”</span><span class="hear">You'll hear it at the start and again halfway.</span>`:`<span class="d">${s.read}</span>`}</li>`).join("");
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

/* ---------- audio ---------- */
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
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.07,t0+.4);g.gain.setValueAtTime(.07,t0+dur-.5);g.gain.linearRampToValueAtTime(0,t0+dur);
  o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+dur+.05)}
let voice=null;
function pickVoice(){if(!canSpeak)return;const vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang));
  voice=vs.find(v=>/Samantha|Daniel|Google UK English Male|Karen|Moira|Serena/i.test(v.name))||vs[0]||null}
if(canSpeak){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function say(text){if(!prefs.voice||!canSpeak)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);if(voice)u.voice=voice;u.rate=.82;u.pitch=.95;u.volume=1;speechSynthesis.speak(u)}catch(e){}}

/* ---------- session ---------- */
function keepAwake(){try{navigator.wakeLock&&navigator.wakeLock.request("screen").then(w=>wake=w).catch(()=>{})}catch(e){}}
function phaseIdx(seg,t){if(!seg.pattern)return -1;const len=seg.pattern.reduce((a,p)=>a+p[1],0);let x=t%len,k=0,cyc=Math.floor(t/len);
  for(;k<seg.pattern.length;k++){if(x<seg.pattern[k][1])break;x-=seg.pattern[k][1]}return cyc*100+k}
function enterSeg(i){segI=i;segElapsed=0;lastPhase=-1;midSaid=false;tickAcc=0;
  if(i>0)bell(1);say(segs[i].say);$("sitStep").textContent=`Step ${i+1} of 6`;}
function begin(){
  ac();if(canSpeak&&prefs.voice){say(`${DAYS[cur].el}. Put the phone down and settle. We begin in ten seconds.`)}
  $("sit").hidden=false;$("sitLive").hidden=false;$("paused").hidden=true;$("sitStep").textContent="Settling";
  segI=-1;segElapsed=0;inSession=true;done=false;run();keepAwake();drawClock();
}
function run(){running=true;last=performance.now();clearInterval(timer);timer=setInterval(()=>{tick();drawClock()},100)}
function tick(){
  const now=performance.now(),dt=Math.min((now-last)/1000,1);last=now;segElapsed+=dt;
  if(segI===-1){if(segElapsed>=SETTLE){bell(1);setTimeout(()=>{if(running&&segI===0)say(segs[0].say)},1800);segI=0;segElapsed=0;$("sitStep").textContent="Step 1 of 6"}return}
  const seg=segs[segI];
  if(segElapsed>=seg.dur){if(segI<segs.length-1){enterSeg(segI+1)}else{finish()}return}
  if(seg.mid&&!midSaid&&segElapsed>=seg.dur/2){midSaid=true;say(seg.mid)}
  if(seg.pattern&&segElapsed>9){ // give the spoken instruction ~9s before pacing begins
    const t=segElapsed-9,pi=phaseIdx(seg,t),p=seg.pattern[pi%100];
    if(pi!==lastPhase){lastPhase=pi;
      if(seg.cues&&seg.cues[p[0]])say(seg.cues[p[0]]);
      tone(p[0],p[1])}
    if(p[0]==="pump"){tickAcc+=dt;if(tickAcc>=.9){tickAcc=0;tone("tick")}}
  }
}
function finish(){stop();inSession=false;done=true;bell(3);setTimeout(()=>say("Session complete. Carry the seal with you."),3500);addCount();
  setTimeout(()=>{$("sit").hidden=true},6000)}
function stop(){running=false;clearInterval(timer);timer=null;try{wake&&wake.release()}catch(e){}wake=null}
function pause(why){if(!running)return;stop();try{speechSynthesis.cancel()}catch(e){}$("sitLive").hidden=true;$("paused").hidden=false;
  const s=segI<0?"settling":`step ${segI+1}, ${segs[segI].name}`;$("pausedNote").textContent=(why||"Paused")+` during ${s}`}

$("begin").onclick=begin;
$("sit").onclick=e=>{if(e.target.closest("#paused"))return;pause()};
$("resume").onclick=()=>{ac();$("paused").hidden=true;$("sitLive").hidden=false;run();keepAwake()};
$("end").onclick=()=>{stop();inSession=false;drawClock();try{speechSynthesis.cancel()}catch(e){}$("sit").hidden=true};
$("tVoice").onclick=()=>{prefs.voice=!prefs.voice;savePrefs();syncToggles()};
$("tTones").onclick=()=>{prefs.tones=!prefs.tones;savePrefs();syncToggles()};
$("test").onclick=()=>{bell(1);setTimeout(()=>tone("in",3),600);setTimeout(()=>tone("out",3),3700);say("This is how the cues will sound.")};
$("days").onclick=e=>{const b=e.target.closest(".day");if(b)selectDay(+b.dataset.i)};
// Timers stop when the phone locks, so pause cleanly instead of skipping ahead.
document.addEventListener("visibilitychange",()=>{if(document.hidden&&running)pause("Paused (screen locked or app left)")});

fetch("content/days.json").then(r=>r.json()).then(data=>{
  DAYS=data.days;SETTLE=data.settleSeconds||10;
  todayIdx=DAYS.findIndex(d=>d.dow===new Date().getDay());cur=todayIdx;
  showCount();syncToggles();selectDay(cur);
});

if(!standalone&&/iPhone|iPad|iPod/.test(navigator.userAgent))$("install").classList.add("show");
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
