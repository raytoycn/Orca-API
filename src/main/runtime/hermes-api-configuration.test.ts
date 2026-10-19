import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import { applyHermesApiConfiguration } from './hermes-api-configuration'

it('preserves Hermes settings and comments, clears the API overlay, and rolls back a failed save', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-hermes-api-'))
  const target = join(directory, 'config.yaml')
  const original = '# preferences\nmodel: previous-model\nagent:\n  max_turns: 12\n'
  const connection = {
    agent: 'hermes',
    protocol: 'openai-completions',
    baseUrl: 'https://example.test/v1',
    model: 'fixture-model',
    apiKey: 'fixture-secret',
    credentialType: 'api-key'
  } as const
  try {
    writeFileSync(target, original)
    const rollback = applyHermesApiConfiguration(
      { type: 'api-set', connection },
      { HERMES_HOME: directory },
      directory
    )
    const applied = readFileSync(target, 'utf8')
    expect(applied).toContain('# preferences')
    expect(applied).not.toContain('fixture-secret')
    expect(parse(applied)).toMatchObject({
      agent: { max_turns: 12 },
      model: {
        default: 'fixture-model',
        api_mode: 'chat_completions',
        api_key: '${ORCA_MODEL_API_KEY}'
      }
    })
    rollback?.()
    expect(readFileSync(target, 'utf8')).toBe(original)

    applyHermesApiConfiguration(
      { type: 'api-set', connection },
      { HERMES_HOME: directory },
      directory
    )
    applyHermesApiConfiguration(
      { type: 'api-clear', agent: 'hermes' },
      { HERMES_HOME: directory, ORCA_HERMES_NATIVE_API: '1' },
      directory
    )
    expect(readFileSync(target, 'utf8')).toBe(original)
    const newer = 'model: changed-after-clear\nagent:\n  max_turns: 20\n'
    writeFileSync(target, newer)
    applyHermesApiConfiguration(
      { type: 'api-set', connection },
      { HERMES_HOME: directory },
      directory
    )
    applyHermesApiConfiguration(
      { type: 'api-clear', agent: 'hermes' },
      { HERMES_HOME: directory, ORCA_HERMES_NATIVE_API: '1' },
      directory
    )
    expect(readFileSync(target, 'utf8')).toBe(newer)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('refuses to overwrite a Hermes model edited outside Orca', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-hermes-conflict-'))
  const target = join(directory, 'config.yaml')
  const connection = {
    agent: 'hermes',
    protocol: 'openai-completions',
    baseUrl: 'https://example.test/v1',
    model: 'fixture-model',
    apiKey: 'fixture-secret',
    credentialType: 'api-key'
  } as const
  try {
    applyHermesApiConfiguration(
      { type: 'api-set', connection },
      { HERMES_HOME: directory },
      directory
    )
    writeFileSync(target, 'model: user-changed\n')
    expect(() =>
      applyHermesApiConfiguration(
        { type: 'api-clear', agent: 'hermes' },
        { HERMES_HOME: directory, ORCA_HERMES_NATIVE_API: '1' },
        directory
      )
    ).toThrow('changed outside Orca')
    expect(readFileSync(target, 'utf8')).toBe('model: user-changed\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
