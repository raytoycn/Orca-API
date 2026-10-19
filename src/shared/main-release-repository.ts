declare const ORCA_RELEASE_REPO: string | undefined

export function mainReleaseRepository(repository: string = 'stablyai/orca'): {
  repository: string
  releasesUrl: string
  tagPattern: RegExp
} {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Expected a GitHub owner/repository for desktop updates')
  }
  return {
    repository,
    releasesUrl: `https://github.com/${repository}/releases`,
    tagPattern: new RegExp(
      `href="https://github\\.com/${repository.replaceAll('.', '\\.')}/releases/tag/([^"]+)"`,
      'g'
    )
  }
}

const source = mainReleaseRepository(
  typeof ORCA_RELEASE_REPO === 'string' ? ORCA_RELEASE_REPO : undefined
)
export const MAIN_RELEASE_REPO = source.repository
export const MAIN_RELEASES_URL = source.releasesUrl
export const MAIN_RELEASE_TAG_PATTERN = source.tagPattern
