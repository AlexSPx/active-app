const { LegalRepository } = require('../../lib/repositories/LegalRepository')
const { apiService } = require('../../services/apiService')
const {
  PRIVACY_POLICY_CONTENT,
  TERMS_OF_SERVICE_CONTENT,
} = require('../../features/legal/legalContent')

const { isNativeOfflineLaunch } = require('../../config/launchPolicy')

jest.mock('../../config/launchPolicy', () => ({ isNativeOfflineLaunch: jest.fn() }))
jest.mock('../../services/apiService', () => ({
  apiService: { getPrivacyPolicy: jest.fn(), getTermsOfService: jest.fn() },
}))

test.each([true, false])(
  'legal content is bundled with native offline launch = %s',
  async (offline) => {
    isNativeOfflineLaunch.mockReturnValue(offline)
    const repository = new LegalRepository()
    await expect(repository.getPrivacyPolicy()).resolves.toBe(PRIVACY_POLICY_CONTENT)
    await expect(repository.getTermsOfService()).resolves.toBe(TERMS_OF_SERVICE_CONTENT)
    expect(PRIVACY_POLICY_CONTENT).toContain('Alexander Asenov')
    expect(TERMS_OF_SERVICE_CONTENT).toContain('14. Contact Us')
    expect(PRIVACY_POLICY_CONTENT + TERMS_OF_SERVICE_CONTENT).not.toMatch(/DRAFT|\[enter /)
    expect(apiService.getPrivacyPolicy).not.toHaveBeenCalled()
    expect(apiService.getTermsOfService).not.toHaveBeenCalled()
  }
)
