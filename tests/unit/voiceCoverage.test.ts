/**
 * Garde-fou : chaque voix PRÉCHARGÉE doit être déclenchable dans au moins un
 * contexte (règle utilisateur : « pas de voix inutilisées »), et chaque voix
 * référencée dans un pool/helper doit être réellement préchargée (pas de clé
 * fantôme qui échouerait silencieusement). PUR — pas de Phaser.
 */
import { describe, it, expect } from 'vitest'
import { VOICE, VOICE_FILES, voiceStage, voiceRunStart } from '@/audio/manifest'

/** Toutes les clés de voix atteignables par le jeu (pools + helpers par stage). */
function referencedVoiceKeys(): Set<string> {
  const ref = new Set<string>()
  for (const pool of Object.values(VOICE)) {
    for (const k of pool) { ref.add(k) }
  }
  for (let order = 1; order <= 10; order++) {
    ref.add(voiceStage(order))
    for (const k of voiceRunStart(order)) { ref.add(k) }
  }
  return ref
}

describe('couverture des voix', () => {
  it('aucune voix préchargée n\'est inutilisée', () => {
    const ref = referencedVoiceKeys()
    const loaded = VOICE_FILES.map(([key]) => key)
    const unused = loaded.filter((k) => !ref.has(k))
    expect(unused).toEqual([])
  })

  it('aucune clé référencée n\'est absente du préchargement (pas de voix fantôme)', () => {
    const loaded = new Set(VOICE_FILES.map(([key]) => key))
    const missing = [...referencedVoiceKeys()].filter((k) => !loaded.has(k))
    expect(missing).toEqual([])
  })

  it('les 27 voix .mp3 ajoutées sont préchargées', () => {
    const loaded = new Set(VOICE_FILES.map(([key]) => key))
    for (const k of ['voice_finish_him', 'voice_incoming', 'voice_worker', 'voice_clou_douken',
      'voice_i_need_assistance', 'voice_round_1_fight', 'voice_round_10_fight',
      'voice_final_round_fight', 'voice_checkpoint', 'voice_mission_complete']) {
      expect(loaded.has(k)).toBe(true)
    }
  })
})
