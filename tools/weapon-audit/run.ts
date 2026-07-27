import { buildWeaponAuditData } from './model'

process.stdout.write(`${JSON.stringify(buildWeaponAuditData(), null, 2)}\n`)
