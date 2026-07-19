/**
 * branch-health — garde-fou contre les branches finies qui dorment pendant
 * que `main` dérive (incident vécu : `feat/stage-intro-cinematics`, cataloguée
 * « feature complète », restée non fusionnée ~10 jours, retrouvée à 146
 * commits de retard sur `main` — la résolution de merge a dû être refaite
 * intégralement, et 2 bugs bloquants ont émergé qui n'auraient jamais dormi
 * si la branche avait été mergée/rejouée plus tôt).
 *
 * N'échoue jamais (exit 0 toujours) : c'est une alerte à lire, pas un gate
 * qui bloque un build. Seuils par défaut : 20 commits de retard sur main,
 * ou 5 jours sans commit sur la branche.
 *
 * Usage : npm run branch:health [-- --behind 30 --days 10]
 */

import { execSync } from 'node:child_process'

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  const v = idx >= 0 ? process.argv[idx + 1] : undefined
  return v ?? fallback
}

const BEHIND_THRESHOLD = Number(arg('behind', '20'))
const DAYS_THRESHOLD = Number(arg('days', '5'))

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

interface BranchRow {
  name: string
  ahead: number
  behind: number
  lastCommitIso: string
  ageDays: number
}

function defaultBranch(): string {
  try {
    const ref = sh('git symbolic-ref refs/remotes/origin/HEAD')
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    // Pas de remote HEAD configuré (repo local uniquement) : repli sur main.
    return 'main'
  }
}

function listLocalBranches(): string[] {
  // Pas de guillemets autour du format : execSync passe par cmd.exe sur
  // Windows, qui ne les retire pas — ils finiraient inclus littéralement
  // dans chaque nom de branche (bug vécu et corrigé ici).
  return sh('git branch --format=%(refname:short)')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function branchRow(branch: string, base: string, nowMs: number): BranchRow {
  const ahead = Number(sh(`git rev-list --count ${base}..${branch}`))
  const behind = Number(sh(`git rev-list --count ${branch}..${base}`))
  const lastCommitIso = sh(`git log -1 --format=%cI ${branch}`)
  const ageDays = Math.floor((nowMs - Date.parse(lastCommitIso)) / (1000 * 60 * 60 * 24))
  return { name: branch, ahead, behind, lastCommitIso, ageDays }
}

function main(): void {
  const base = defaultBranch()
  const branches = listLocalBranches().filter((b) => b !== base)

  if (branches.length === 0) {
    console.log(`[branch:health] aucune branche locale hors ${base}. Rien à signaler.`)
    return
  }

  const nowMs = Date.now()
  const rows = branches.map((b) => branchRow(b, base, nowMs))

  console.log(`[branch:health] base = ${base} · seuils : ${BEHIND_THRESHOLD} commits de retard / ${DAYS_THRESHOLD} jours\n`)
  console.log('branche'.padEnd(36) + 'devant'.padEnd(9) + 'retard'.padEnd(9) + 'dernier commit'.padEnd(17) + 'âge')

  let flagged = 0
  for (const r of rows.sort((a, b) => b.behind - a.behind)) {
    const risky = r.behind > BEHIND_THRESHOLD || r.ageDays > DAYS_THRESHOLD
    if (risky) {
      flagged++
    }
    const mark = risky ? '⚠️ ' : '   '
    const dateOnly = r.lastCommitIso.slice(0, 10)
    console.log(
      mark +
        r.name.padEnd(33) +
        String(r.ahead).padEnd(9) +
        String(r.behind).padEnd(9) +
        dateOnly.padEnd(14) +
        `${r.ageDays}j`
    )
  }

  if (flagged > 0) {
    console.log(
      `\n⚠️  ${flagged} branche(s) en risque de dérive de merge — au-delà du seuil, résoudre les conflits coûte cher et une "feature finie" peut cacher un bug jamais rejoué (cf. incident feat/stage-intro-cinematics, 146 commits de retard). Merge/rebase bientôt, ou rejoue-la avant de la déclarer "prête".`
    )
  } else {
    console.log('\n✅ Aucune branche en risque de dérive.')
  }
}

main()
