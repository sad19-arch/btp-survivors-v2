import { describe, it, expect, beforeEach } from 'vitest'
import { saveUserLayout, getUserLayout, listUserLayouts, deleteUserLayout } from '@ui/userLayouts'

/**
 * Store des stages édités par le joueur (localStorage `btp:userLayouts`) — la
 * sauvegarde JOUABLE du jeu final. On vérifie le CRUD et la robustesse (aucun
 * layout → null / liste vide), sans toucher au déterminisme sim (couche app/UI).
 */
describe('userLayouts (store joueur, localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sans rien de sauvé : getUserLayout → null, listUserLayouts → []', () => {
    expect(getUserLayout('terrassement')).toBeNull()
    expect(listUserLayouts()).toEqual([])
  })

  it('save puis get renvoie exactement la chaîne sauvée', () => {
    const json = '{"stage":"terrassement","instances":[]}'
    saveUserLayout('terrassement', json)
    expect(getUserLayout('terrassement')).toBe(json)
  })

  it('save écrase la version précédente du même stage', () => {
    saveUserLayout('fondations', '{"v":1}')
    saveUserLayout('fondations', '{"v":2}')
    expect(getUserLayout('fondations')).toBe('{"v":2}')
    expect(listUserLayouts()).toEqual(['fondations'])
  })

  it('listUserLayouts liste tous les stages sauvés', () => {
    saveUserLayout('terrain_vierge', '{}')
    saveUserLayout('terrassement', '{}')
    expect(listUserLayouts().sort()).toEqual(['terrain_vierge', 'terrassement'])
  })

  it('deleteUserLayout retire le stage (retour au niveau généré)', () => {
    saveUserLayout('gros_oeuvre', '{}')
    deleteUserLayout('gros_oeuvre')
    expect(getUserLayout('gros_oeuvre')).toBeNull()
    expect(listUserLayouts()).toEqual([])
  })

  it('persiste réellement dans localStorage (relecture par une autre lecture)', () => {
    saveUserLayout('charpente', '{"ok":true}')
    // Simule un nouveau boot : on relit via l'API (readAll relit le storage).
    expect(getUserLayout('charpente')).toBe('{"ok":true}')
    expect(localStorage.getItem('btp:userLayouts')).toContain('charpente')
  })
})
