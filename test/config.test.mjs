/** 配置优先级单测。语义见 INTERFACE.md §2（值见 config.js）。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS, defaultsFor, resolveConfig } from '../config.js'

test('默认值齐备且类型正确', () => {
  assert.equal(typeof DEFAULTS.albumsDir, 'string')
  assert.equal(typeof DEFAULTS.maxImageBytes, 'number')
  assert.equal(Array.isArray(DEFAULTS.imageExts), true)
  assert.equal(DEFAULTS.imageExts.every((e) => e.startsWith('.')), true)
  assert.equal(DEFAULTS.enabledAlbums, null)
})

test('home 决定默认路径，不跟着 cwd 走', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-gallery-home-'))
  const d = defaultsFor(home)
  assert.equal(d.albumsDir.startsWith(home), true)
  assert.equal(d.settingsFile.startsWith(home), true)
})

test('优先级：用户设置 > patch config > 默认', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-gallery-home-'))
  const d = defaultsFor(home)
  const merged = resolveConfig({ albumId: 'from-settings' }, { albumId: 'from-patch', publicBaseUrl: 'http://x' }, home)
  assert.equal(merged.albumId, 'from-settings')
  assert.equal(merged.publicBaseUrl, 'http://x')
  assert.equal(merged.maxImageBytes, d.maxImageBytes)
  assert.equal(merged.albumsDir, d.albumsDir)
})

test('空串/null 不覆盖已有值（避免设置文件里的空字段把配置打回空）', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-gallery-home-'))
  const merged = resolveConfig({ publicBaseUrl: '', albumId: null }, {}, home)
  assert.equal(merged.publicBaseUrl, DEFAULTS.publicBaseUrl)
  assert.equal(merged.albumId, DEFAULTS.albumId)
})
