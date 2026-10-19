import { PRIVACY_POLICY_CONTENT, TERMS_OF_SERVICE_CONTENT } from '../../features/legal/legalContent'

export class LegalRepository {
  async getPrivacyPolicy(): Promise<string> {
    return PRIVACY_POLICY_CONTENT
  }

  async getTermsOfService(): Promise<string> {
    return TERMS_OF_SERVICE_CONTENT
  }
}
