# Brief audio à générer — BTP Survivors

> But : liste des **sons, musiques et voix arcade** à créer (avec prompts prêts à coller), pour compléter tes assets existants.
> Généré le 2026-07-02. Le reste de l'audio (titre, menu, stage ×3, boss ×3, victoire, la plupart des SFX) est **déjà couvert** par tes fichiers — voir §5, ne pas régénérer.

## 0. Comment s'en servir
- **Musiques / boucles / nappes** → **Suno** (coche *Instrumental*, précise le style + « loopable », puis on coupe/boucle proprement).
- **SFX one-shot** (armes, impacts) → **générateur de SFX** (ElevenLabs *Sound Effects*, ou équivalent). Suno est mauvais pour ça.
- **Voix arcade** → **ElevenLabs / voix TTS** (voix « annonceur », ou enregistrement perso passé en lo-fi). Suno peut dépanner en mode voix mais moins précis.
- **Format de rendu** : `.ogg` de préférence (sinon `.wav`). Court = mono ; musique = stéréo.
- **Quand c'est prêt** : dépose dans `public/audio/{music,sfx,voice}/` avec le **nom fichier** de la colonne « fichier ». Je branche direct (le manifeste est data-driven).

### Ancrages de style (à rappeler dans chaque prompt)
- **Musique** : *16-bit chiptune / arcade SNES–Mega Drive, punchy, énergie chantier/industriel, instrumental, sans voix*.
- **Voix** : *annonceur d'arcade rétro années 90 (type Street Fighter / Metal Slug), voix masculine hype, claire et punchy, léger grain lo-fi/8-bit*.

---

## 1. 🎙️ Voix arcade (annonceur) — priorité haute
Voix masculine unique, cohérente sur toutes les lignes. **Prompt global de voix** à réutiliser :
> `Retro 90s arcade game announcer, energetic hype male voice, punchy and clear, dramatic sportscaster energy, slight lo-fi 8-bit crunch, short exclamation, dry (no music). Say: "<TEXTE>"`

| Fichier | Texte exact | Déclencheur (jeu) | Ton / jeu d'acteur |
|---|---|---|---|
| `voice_presents.ogg` | « AIL Entertainment presents » | Intro (1× au boot) | Grave, épique, révélation lente |
| `voice_ready.ogg` | « Ready?… GO! » | Lancement de run / stage | « Ready » suspendu montant, « GO! » explosif |
| `voice_fight.ogg` | « FIGHT! » | Variante de GO (début combat) | Sec, agressif |
| `voice_stage_1.ogg` … `voice_stage_10.ogg` | « STAGE ONE! » … « STAGE TEN! » | Début de chaque stage (max 1×) | Clair, annonce ; monter en intensité vers 10 |
| `voice_final_stage.ogg` | « FINAL STAGE! » | Dernière phase (livraison/audit) | Épique, solennel |
| `voice_boss.ogg` | « BOSS FIGHT! » | Apparition du boss uniquement | Menaçant, grave, écho léger |
| `voice_bonus.ogg` | « BONUS! » | Bonus rare / coffre / reward spécial (pas les pickups normaux) | Excité, pétillant |
| `voice_thankyou.ogg` | « THANK YOU! » | Ouvrier prisonnier libéré | Chaleureux, reconnaissant |
| `voice_gameover.ogg` | « GAME OVER » | Mort / échec | Grave, déflaté, ominous |
| `voice_victory.ogg` | « VICTORY! » | Boss vaincu / run réussie | Triomphant |
| `voice_stage_clear.ogg` | « STAGE CLEAR! » | Fin de stage réussie (passage au suivant) | Satisfait, positif |
| `voice_final_wave.ogg` | « FINAL WAVE! » | (Optionnel) vague finale si on l'ajoute | Urgent, épique |

> Astuce : génère chaque ligne **séparément** (1 fichier = 1 réplique) pour les déclencher indépendamment. Pour « STAGE 1-10 », tu peux n'en faire que quelques-uns au début si tu préfères.

---

## 2. 🎵 Musiques à créer (Suno) — ce qui manque à ta bibliothèque
Tes pistes couvrent titre/menu/gameplay/boss/victoire. Manquent surtout :

| Fichier | Usage | Durée / boucle | Prompt Suno (Instrumental) |
|---|---|---|---|
| `music_gameover.ogg` | Écran de défaite | 10-18 s, one-shot | `16-bit chiptune game over jingle, short, descending melancholic melody in minor key, deflated, SNES sound chip, instrumental, no vocals, dry ending` |
| `music_final_wave.ogg` | (Optionnel) vague/phase finale | ~75-90 s, **loopable** | `Intense 16-bit chiptune battle theme, fast ~165 BPM, driving bass, urgent arpeggios, industrial construction energy, epic climax, seamless loop, SNES/Mega Drive, instrumental, no vocals` |
| `music_stage_alt.ogg` | (Optionnel) + de variété gameplay | ~70-90 s, **loopable** | `Upbeat 16-bit chiptune action groove, ~150 BPM, catchy melodic hook, hammering percussion, construction-site vibe, seamless loop, SNES arcade, instrumental, no vocals` |

> Suno rend des morceaux longs : garde la partie la plus « boucle-able » (souvent le refrain/loop central) et fais une boucle propre. Pour `music_gameover`, une intro courte suffit.

---

## 3. 🔊 SFX à créer (générateur de SFX, pas Suno) — priorité haute
Aucun son d'outil de chantier n'existe dans ton pack. Les 3 armes sont le manque #1.

| Fichier | Arme / événement | Caractère | Prompt (SFX generator) |
|---|---|---|---|
| `sfx_cloueur.ogg` | Cloueur (tir auto ~toutes 0,5 s) | Court, sec, mécanique | `Pneumatic nail gun single shot, short punchy "cha-thunk", mechanical, dry, no reverb, retro arcade game SFX, ~0.25s` |
| `sfx_scie_loop.ogg` | Scie orbitale (lames qui tournent) | **Boucle continue** | `Continuous circular saw / angle grinder spinning, metallic whir, steady mid-high pitch, seamless loop, ~2s, retro game SFX` |
| `sfx_marteau.ogg` | Marteau de zone (onde) | Impact lourd + whoosh | `Heavy sledgehammer metal clang impact with a low whoosh shockwave, powerful, dry, retro arcade hit, ~0.6s` |
| `sfx_ennemi_paperasse.ogg` | (Opt.) mort ennemi « paperasse » | Froissement + tampon | `Crumpling paper burst plus a quick rubber stamp thump, dry, snappy, cartoon office SFX, ~0.4s` |

---

## 4. 🌫️ Ambiance (Suno *ou* SFX generator) — nice-to-have fort
| Fichier | Usage | Boucle | Prompt |
|---|---|---|---|
| `amb_chantier_loop.ogg` | Nappe discrète sous la musique de jeu | ~30-60 s, **loopable** | `Distant construction site ambience, faint intermittent hammering, low machinery hum, light wind, subtle and unobtrusive, seamless loop, lo-fi background bed` |

---

## 5. ✅ Déjà couvert par tes assets (NE PAS régénérer)
- **Musique** : `ecran titre 2` (titre), `menu compétences` (upgrade), `stage`/`stage 2`/`stage 3` (gameplay, rotation par phase), `Boss in game` (boss), `happy` (victoire), `fanfare.ogg` (fin de stage).
- **SFX** : `hurt_1-4` (dégât joueur), `lose_1-4` (mort joueur), `explosion_1-5`/`soft_destruction` (mort ennemi), `level_up`, `collect_1-7` (XP), `powerup`/`equip` (upgrade choisi), `select`/`confirm`/`cancel` (menus), `siren` (spawn boss), `chime` (prisonnier), `computer_1-2` (bips administratifs), `teleport` (téléporteur boss).

## 6. Convention de retour (pour que je branche direct)
- Dossiers : `public/audio/music/`, `public/audio/sfx/`, `public/audio/voice/`.
- Noms = colonne « fichier » ci-dessus (kebab/underscore, minuscules, `.ogg`).
- Boucles : indique-moi juste « loop » (ou nomme `_loop`) pour que je règle `loop:true`.
- Tu peux livrer par lots (ex. voix d'abord, armes ensuite) — je câble au fil de l'eau.
