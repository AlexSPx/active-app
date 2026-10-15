const { LegalRepository } = require('../../lib/repositories/LegalRepository')
const { apiService } = require('../../services/apiService')
const {
  PRIVACY_POLICY_CONTENT,
  TERMS_OF_SERVICE_CONTENT,
} = require('../../features/legal/legalContent')

jest.mock('../../config/launchPolicy', () => ({ isNativeOfflineLaunch: () => true }))
jest.mock('../../services/apiService', () => ({
  apiService: { getPrivacyPolicy: jest.fn(), getTermsOfService: jest.fn() },
}))

test('native legal content is bundled and makes no account or legal API calls', async () => {
  const repository = new LegalRepository()
  await expect(repository.getPrivacyPolicy()).resolves.toBe(PRIVACY_POLICY_CONTENT)
  await expect(repository.getTermsOfService()).resolves.toBe(TERMS_OF_SERVICE_CONTENT)
  expect(PRIVACY_POLICY_CONTENT).toContain('Erase data on this device')
  expect(apiService.getPrivacyPolicy).not.toHaveBeenCalled()
  expect(apiService.getTermsOfService).not.toHaveBeenCalled()
})
