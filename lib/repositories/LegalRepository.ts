import { apiService } from '../../services/apiService'

const EXPORT_COMPLIANCE = `

## Export Compliance

You agree to comply with all applicable export and import laws and regulations, including those of the United States. You represent that you are not located in a country subject to a U.S. government embargo, or that has been designated by the U.S. government as a "terrorist supporting" country, and that you are not listed on any U.S. government list of prohibited or restricted parties.`

export class LegalRepository {
  async getPrivacyPolicy(): Promise<string> {
    return apiService.getPrivacyPolicy()
  }

  async getTermsOfService(): Promise<string> {
    const data = await apiService.getTermsOfService()
    return data + EXPORT_COMPLIANCE
  }
}
