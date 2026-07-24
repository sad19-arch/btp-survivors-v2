import fs from 'node:fs'
import path from 'node:path'

const rate = 44100
const out = path.resolve('public/audio/sfx/deaths/stage01')
fs.mkdirSync(out, { recursive: true })

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s)), ((s ^= s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ (s >>> 14)) >>> 0) / 4294967296
}

function wav(name: string, seconds: number, seed: number, synth: (t: number, duration: number, noise: number, random: () => number) => number): void {
  const count = Math.round(rate * seconds)
  const random = rng(seed)
  const samples = new Float32Array(count)
  let filtered = 0
  for (let i = 0; i < count; i += 1) {
    const t = i / rate
    filtered = filtered * 0.82 + (random() * 2 - 1) * 0.18
    samples[i] = synth(t, seconds, filtered, random)
  }
  let peak = 0
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value))
  }
  const gain = 0.82 / Math.max(peak, 0.001)
  const data = Buffer.alloc(44 + count * 2)
  data.write('RIFF', 0); data.writeUInt32LE(36 + count * 2, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(count * 2, 40)
  samples.forEach((value, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * gain)) * 32767), 44 + i * 2))
  fs.writeFileSync(path.join(out, name), data)
}

const hit = (t: number, at: number, decay: number, frequency: number): number => t < at ? 0 : Math.sin((t - at) * frequency * Math.PI * 2) * Math.exp(-(t - at) * decay)

for (let v = 1; v <= 3; v += 1) {
  wav(`death_small_${v}.wav`, 0.19 + v * 0.015, 100 + v, (t, _d, noise) =>
    noise * Math.exp(-t * (18 + v)) * 0.8 + hit(t, 0.07 + v * 0.006, 38, 720 + v * 80) * 0.45)
  wav(`death_fast_${v}.wav`, 0.23 + v * 0.018, 200 + v, (t, _d, noise) =>
    noise * Math.exp(-t * 25) * 0.34 + hit(t, 0.012, 30, 1180 + v * 95) * 0.65 + hit(t, 0.115 + v * 0.004, 42, 1550 - v * 70) * 0.42)
  wav(`death_brute_${v}.wav`, 0.36 + v * 0.022, 300 + v, (t, _d, noise) =>
    Math.sin(t * Math.PI * 2 * (62 + v * 4)) * Math.exp(-t * 13) * 0.75 + noise * Math.exp(-t * 10) * 0.45 + hit(t, 0.19 + v * 0.008, 19, 260 + v * 25) * 0.42)
}

console.log('Generated 9 Stage 1 death one-shots in', out)
