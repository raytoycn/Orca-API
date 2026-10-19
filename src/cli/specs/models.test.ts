import { describe, expect, it } from 'vitest'
import { findCommandSpec } from '../args'
import { COMMAND_SPECS } from './index'

describe('orca models command specs', () => {
  it('registers list and use', () => {
    expect(findCommandSpec(COMMAND_SPECS, ['models', 'list'])?.path).toEqual(['models', 'list'])
    expect(findCommandSpec(COMMAND_SPECS, ['models', 'use'])?.path).toEqual(['models', 'use'])
  })
})
