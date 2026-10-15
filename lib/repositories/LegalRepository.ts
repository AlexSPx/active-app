import { apiService } from '../../services/apiService'
import { isNativeOfflineLaunch } from '../../config/launchPolicy'
import { PRIVACY_POLICY_CONTENT, TERMS_OF_SERVICE_CONTENT } from '../../features/legal/legalContent'

const EXPORT_COMPLIANCE = `

## Export Compliance

You agree to comply with all applicable export and import laws and regulations, including those of the United States. You represent that you are not located in a country subject to a U.S. government embargo, or that has been designated by the U.S. government as a "terrorist supporting" country, and that you are not listed on any U.S. government list of prohibited or restricted parties.`

export class LegalRepository {
  async getPrivacyPolicy(): Promise<string> {
    if (isNativeOfflineLaunch()) return PRIVACY_POLICY_CONTENT
    return apiService.getPrivacyPolicy()
  }

  async getTermsOfService(): Promise<string> {
    if (isNativeOfflineLaunch()) return TERMS_OF_SERVICE_CONTENT
    const data = await apiService.getTermsOfService()
    return data + EXPORT_COMPLIANCE
  }
}
