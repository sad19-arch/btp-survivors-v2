#!/usr/bin/env bash
# Hook PreToolUse(Bash) — bloque mecaniquement deux commandes git dangereuses
# dans cet arbre de travail multi-agents partage. Voir CLAUDE.md, section
# "Discipline multi-agents (git, gates, dette)".
#
# 1. git stash (toutes formes) : un pop rate peut effacer pour de bon le
#    travail non commite d'un autre agent.
# 2. git add -A / --all / . : add prend TOUT le fichier ou tout le dossier,
#    pas seulement les lignes modifiees par l'agent courant, et peut donc
#    absorber en silence le travail en cours d'un autre agent.
#
# jq n'est pas garanti present sur la machine (absent au moment de l'ecriture) ;
# node l'est toujours dans ce repo (projet npm/vite) -> utilise pour le JSON.

cmd=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);process.stdout.write(j.tool_input&&j.tool_input.command?j.tool_input.command:'')}catch(e){}})")
[ -z "$cmd" ] && exit 0

STASH_RE='(^|[;&|]) *git( +-[A-Za-z][^ ]*( +[^ ]+)?)* +stash([ ]|$)'
ADD_FLAG_RE='(^|[;&|]) *git +add( +[^ ;&|]+)* +(-A|--all)([ ]|$)'
ADD_DOT_RE='(^|[;&|]) *git +add( +[^ ;&|]+)* +\.([ ]|$)'

if echo "$cmd" | grep -qE "$STASH_RE"; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git stash interdit dans cet arbre partage multi-agents (CLAUDE.md, section Discipline multi-agents) : un stash pop rate peut effacer pour de bon le travail non commite d un autre agent. Committe ce dont tu as besoin par chemin explicite, ou repose le travail autrement."}}'
  exit 0
fi

if echo "$cmd" | grep -qE "$ADD_FLAG_RE" || echo "$cmd" | grep -qE "$ADD_DOT_RE"; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git add -A / --all / . interdit dans cet arbre partage (CLAUDE.md, section Discipline multi-agents) : add prend TOUT le fichier ou tout le dossier, pas seulement tes lignes modifiees, et peut absorber en silence le travail en cours d un autre agent. Stage par chemin explicite : git add <fichier1> <fichier2>."}}'
  exit 0
fi

exit 0
