#!/usr/bin/env node
// Records every spoken line in content/days.json with an ElevenLabs voice, into audio/.
//
//   node tools/voice.mjs key                 save your ElevenLabs API key (hidden input, stored outside the project)
//   node tools/voice.mjs voices              list the voices on your account; ★ marks calm / soft ones
//   node tools/voice.mjs audition [ids...]   record and play a short sample for each voice (default: the ★ ones)
//   node tools/voice.mjs record <voiceId>    record all lines; unchanged lines are skipped. --force re-records everything
//   node tools/voice.mjs play <clipId>       play one recording, e.g. fri-arrive or common-in_a
//
// The key is read from ELEVENLABS_API_KEY, or from ~/.config/seven-pools/elevenlabs_key.

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AUDIO = join(ROOT, "audio");
const MANIFEST = join(AUDIO, "clips.json");
const AUDITIONS = join(ROOT, "tools", ".auditions");
const KEY_FILE = join(homedir(), ".config", "seven-pools", "elevenlabs_key");
const API = "https://api.elevenlabs.io";

// Slow, soft delivery. Lower stability = more expressive; speed below 1 slows the voice down.
const MODEL = "eleven_multilingual_v2";
const SETTINGS = { stability: 0.6, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.85 };
const CALM = /calm|sooth|soft|meditat|asmr|relax|gentle|whisper|warm|serene|breath/i;

function readKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, "utf8").trim();
  console.error("No ElevenLabs key yet. Run:  node tools/voice.mjs key");
  process.exit(1);
}

async function api(path, { method = "GET", body, raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "xi-api-key": readKey(), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = await res.text();
    try { const j = JSON.parse(msg); msg = j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j); } catch {}
    if (res.status === 401) msg += "\n  (Check the key, and that it has Text to Speech, Voices (read) and User (read) access.)";
    throw new Error(`ElevenLabs ${res.status}: ${msg}`);
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    let s = "";
    const { stdin } = process;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n");
          return resolve(s.trim());
        }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); }
        if (ch === "\u007f") s = s.slice(0, -1); else s += ch;
      }
    };
    stdin.on("data", onData);
  });
}

// Every line in the content file, keyed the same way the app looks them up.
function allLines() {
  const data = JSON.parse(readFileSync(join(ROOT, "content", "days.json"), "utf8"));
  const lines = {};
  for (const [k, text] of Object.entries(data.common)) lines["common-" + k] = text;
  for (const d of data.days) for (const [k, text] of Object.entries(d.say)) lines[`${d.short.toLowerCase()}-${k}`] = text;
  return lines;
}

const duration = file => {
  const m = execFileSync("afinfo", [file], { encoding: "utf8" }).match(/estimated duration: ([\d.]+)/);
  return m ? Math.round(parseFloat(m[1]) * 100) / 100 : null;
};
const tts = (voiceId, text) =>
  api(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", body: { text, model_id: MODEL, voice_settings: SETTINGS }, raw: true });

async function credits() {
  try { const s = await api("/v1/user/subscription"); return `${s.character_limit - s.character_count} of ${s.character_limit} characters left this month (${s.tier} plan)`; }
  catch { return null; }
}

const commands = {
  async key() {
    if (!process.stdin.isTTY) { console.error("Run this in a terminal so the key can be typed privately."); process.exit(1); }
    const key = await askHidden("Paste your ElevenLabs API key (it won't be shown), then press Enter: ");
    if (!key) { console.error("No key entered."); process.exit(1); }
    mkdirSync(dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, key + "\n", { mode: 0o600 }); chmodSync(KEY_FILE, 0o600);
    process.env.ELEVENLABS_API_KEY = key;
    try { await api("/v1/voices"); } catch (e) { console.error("Saved, but the key didn't work: " + e.message); process.exit(1); }
    console.log(`Key saved to ${KEY_FILE} (only your user can read it).`);
    const c = await credits(); if (c) console.log(c);
  },

  async voices() {
    const { voices } = await api("/v1/voices");
    for (const v of voices) {
      const l = v.labels || {};
      const info = [l.gender, l.accent, l.age, l.description, l.use_case || l["use case"], v.description].filter(Boolean).join(", ");
      console.log(`${CALM.test(info) ? "★" : " "} ${v.name.padEnd(28)} ${v.voice_id}  ${info}`);
    }
    console.log("\nAdd more from the Voice Library on elevenlabs.io (search \"meditation\" or \"ASMR\"), then run this again.");
  },

  async audition(...ids) {
    const { voices } = await api("/v1/voices");
    const info = v => Object.values(v.labels || {}).join(" ") + " " + (v.description || "");
    const pick = ids.length ? voices.filter(v => ids.includes(v.voice_id)) : voices.filter(v => CALM.test(info(v))).slice(0, 4);
    if (!pick.length) { console.error("No voices to audition. Pass voice ids from `voices`."); process.exit(1); }
    const lines = allLines();
    const sample = `${lines["fri-arrive"]} ... ${lines["common-in_a"]} ... ${lines["common-out_a"]}`;
    mkdirSync(AUDITIONS, { recursive: true });
    for (const v of pick) {
      const file = join(AUDITIONS, `${v.name.replace(/[^\w]+/g, "_")}.mp3`);
      writeFileSync(file, await tts(v.voice_id, sample));
      console.log(`▶ ${v.name}  (${v.voice_id})`);
      execFileSync("afplay", [file]);
    }
    console.log(`\nSamples saved in ${AUDITIONS}. To record with one:  node tools/voice.mjs record <voiceId>`);
  },

  async record(voiceId, flag) {
    if (!voiceId) { console.error("Usage: node tools/voice.mjs record <voiceId> [--force]"); process.exit(1); }
    const force = flag === "--force";
    const { voices } = await api("/v1/voices");
    const voice = voices.find(v => v.voice_id === voiceId);
    if (!voice) { console.error(`Voice ${voiceId} isn't on your account. Run \`voices\` to see ids.`); process.exit(1); }
    mkdirSync(AUDIO, { recursive: true });
    const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { clips: {} };
    const lines = allLines(), clips = {};
    const todo = Object.entries(lines).filter(([id, text]) => {
      const hash = createHash("sha1").update(JSON.stringify([voiceId, MODEL, SETTINGS, text])).digest("hex").slice(0, 12);
      const prev = old.clips[id];
      if (!force && prev && prev.hash === hash && existsSync(join(AUDIO, prev.file))) { clips[id] = prev; return false; }
      clips[id] = { file: id + ".mp3", hash };
      return true;
    });
    const chars = todo.reduce((a, [, t]) => a + t.length, 0);
    console.log(`Recording ${todo.length} of ${Object.keys(lines).length} lines with ${voice.name} (~${chars} characters).`);
    const c = await credits(); if (c) console.log(c);
    let n = 0;
    for (const [id, text] of todo) {
      const file = join(AUDIO, clips[id].file);
      writeFileSync(file, await tts(voiceId, text));
      clips[id].dur = duration(file);
      process.stdout.write(`  ${String(++n).padStart(3)}/${todo.length}  ${id.padEnd(20)} ${clips[id].dur}s\n`);
      writeFileSync(MANIFEST, JSON.stringify({ voice: { id: voiceId, name: voice.name }, model: MODEL, settings: SETTINGS, clips: { ...old.clips, ...clips } }, null, 1));
    }
    for (const id of Object.keys(old.clips)) if (!lines[id]) { try { unlinkSync(join(AUDIO, old.clips[id].file)); } catch {} }
    writeFileSync(MANIFEST, JSON.stringify({ voice: { id: voiceId, name: voice.name }, model: MODEL, settings: SETTINGS, clips }, null, 1));
    console.log(`Done. ${Object.keys(clips).length} recordings listed in audio/clips.json.`);
  },

  async play(id) {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (!m.clips[id]) { console.error("No recording called " + id); process.exit(1); }
    execFileSync("afplay", [join(AUDIO, m.clips[id].file)]);
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 10).join("\n").replace(/^\/\/ ?/gm, "")); process.exit(cmd ? 1 : 0); }
commands[cmd](...args).catch(e => { console.error(e.message); process.exit(1); });
