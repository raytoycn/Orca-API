import { afterEach, expect, it, vi } from 'vitest'
import { mainReleaseRepository } from './main-release-repository'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('keeps the original release source for ordinary builds', () => {
  expect(mainReleaseRepository().releasesUrl).toBe('https://github.com/stablyai/orca/releases')
})

it('pins fork builds and matches only tags from that repository', async () => {
  vi.stubGlobal('ORCA_RELEASE_REPO', 'raytoycn/Orca-API')
  vi.resetModules()
  const source = await import('./main-release-repository')
  const channels = await import('./release-channel')
  expect(source.MAIN_RELEASES_URL).toBe('https://github.com/raytoycn/Orca-API/releases')
  expect(channels.getReleaseRepoForChannel('stable')).toBe('raytoycn/Orca-API')
  expect(channels.getReleaseRepoForChannel('rc')).toBe('raytoycn/Orca-API')
  expect(
    source.MAIN_RELEASE_TAG_PATTERN.test('href="https://github.com/stablyai/orca/releases/tag/v1"')
  ).toBe(false)
  expect(
    source.MAIN_RELEASE_TAG_PATTERN.test(
      'href="https://github.com/raytoycn/Orca-API/releases/tag/v1"'
    )
  ).toBe(true)
})

it('rejects non-repository inputs', () => {
  expect(() => mainReleaseRepository('https://example.test/owner/repo')).toThrow()
  expect(() => mainReleaseRepository('../owner/repo')).toThrow()
})
