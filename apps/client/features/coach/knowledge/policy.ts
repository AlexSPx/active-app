import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import decisions from '../../../lib/data/coach/revision-01/decisions.json'

export type KnowledgePolicy = 'release' | 'development_model_reviewed'
export const releasePolicy: KnowledgePolicy = 'release'

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

const trustedRows: Record<string, string> = {
  'card:card-001': 'ce1ecace416ec2d2da45bb462fe0a66de0afa9dcf8b9dcd2e9e0a1c1e62fe835',
  'card:card-002': '93d55a18aa9e9eeac4d9e3d42525466fcac4c203e316d59a64fc85d80ec8626c',
  'card:card-003': 'd0d5cf3de82883a5ad4e1e7568f90a056ff75bded128063c3f044a46476a3948',
  'card:card-004': '860fea457538fb23d13d9e7d32f91d8b30150161dbe0c152ed6cb410e2662346',
  'card:card-005': 'ab84788c09dca4f6c6855b35929262e2e6068a7b1885624ed3ad0e16cc028619',
  'card:card-006': '327b8ff733cf8b60b870453774fbff56076f4f0846e6a0bf3a51b7d5e72eba73',
  'card:card-008': '4c1a93cf3508f0e88a51b8f01822b3c55e3c141c96542cc2308b55350b6d5aac',
  'card:card-009': '4a8553cdbeb99d119fba69e71bc59e2aa52a4745b768b2715e73df9e0f292ce9',
  'card:card-011': '86f160e084352bc3b1ed873544580c6d67b64899d053cc7f04811611f4cef43c',
  'card:card-012': '552159c7554503d9c18baa9091119b06ac04930cd5400b473c6ac569460f53c2',
  'card:card-013': '41042bddaaa525e78c726fe9020c0740c0e2b9d25e3c2c4ee670c1b29ac1f571',
  'card:card-016': '578b9273ec0c3aab4a50806fd9f731ef31881cddb1ac86d90c9e76a4912f06e7',
  'card:card-018': '14bd9a264b82de8cfd29f03ad1c9a38708a08c745c6c9b405a044292f152311f',
  'card:card-020': '9736c683d732a612916e083f3efffb349e199e98c754e7d12b5273eb5c2b0f36',
  'card:card-021': 'a8c34823d97d4378a4f5316b84c80b31b9c7f5b3d3243eecc0eacc9162a6dd02',
  'card:card-022': '4302f68c9f0e24bf392fb41d0f5b77b940d78d74033d3f0353de0015116df537',
  'card:card-023': '37d3194197a5b4810872e464323e81d3c16ba8b316b2574882a5849de28e2a43',
  'card:card-024': '431d6e021ff70f49229e353c260ffb61701428ab2b1c35f95deae78c1b2def16',
  'card:card-025': '08c7376161fbff927640a27a6f52cda836e051d76075ea11bd8d95f2e889f752',
  'card:card-026': 'e4d3b0f48cc7e45d67f65d090199618981db51bdb9a67cc6aff6fb7e1b03f88e',
  'card:card-027': 'b029a9c4d503fcec24a87368512cfa7a9a9649e2b0fb79878ad20bf0acc34d77',
  'card:card-028': 'fa66a5ad31a59f82d529a5ea011c7f6177b45bb45c5a24dd51c7a7bc770f0d9b',
  'card:card-029': '3478212b414495b700b36ca805a5dc502362a9e09c48bedfd9410b2a47150917',
  'card:card-030': 'a4f51b2332ae730120d034f05eff70f7ebde540b42400c0be969e6bb390fe403',
  'card:card-031': 'b2648e8bebe777954c0b2940b613cac80ac1e155015b9e77a77fdf8e8e4ff2b5',
  'card:card-032': '023ec1eb4264fe79a31402e59783be94b638c3393a0912141756fead51294935',
  'card:card-035': 'faf9601058e178ee6e9bcd926f9acc651e707f38b1999b795d4a1ee69900fb8c',
  'card:card-036': '69e1de3796404d55ccc9f5ec134ac25df195570839c8fedea91d36eaf4b45cc3',
  'card:card-037': '5902e1461e3151cad2fb023ad1d7b4f96d35720b05f529ba14b1ed49643fa1f4',
  'card:card-038': 'ba4466d5fa7136e576a8dc60cac7019f06363a805cf9eaf1f0c7a45fb1b8cc9f',
  'card:card-039': 'c9d216e559805a2f42d403a9cc745e47e219353e02a33bf0e604c63d68e55189',
  'card:card-040': '9a118417f68c131df8cda6991a0257118e3551533ded3331fa78a9a139e4be5c',
  'card:card-043': '7854d42f8cc52e13929235fa7c9acebb08097c78156bc370b9744603f4606e5b',
  'annotation:Bodyweight_Squat': '8bad29948670355a6e0bbb9ee449df4184abc5ccca6669d9f12f0a87246856ad',
  'annotation:Dumbbell_Bench_Press':
    '0a6c70e4cece328266ecfc5e525e613f2bd4fc2c8b33359d4dfc53650a08fe4e',
  'annotation:Pullups': '0915a89a0ae892e07e75b0a89d0fe9fdfd0f38b78d1d98a4519dd719680d3538',
}
const trustedLedgerHash = '6be74f598d990bbc3cf8657c449c1bc07204c94112f1cdc02fe5ce5ad27a246d'
const hash = (value: unknown) => bytesToHex(sha256(utf8ToBytes(canonical(value))))

export function isDevelopmentReviewed(
  kind: 'card' | 'annotation',
  id: string,
  raw: unknown
): boolean {
  return hash(decisions) === trustedLedgerHash && trustedRows[`${kind}:${id}`] === hash(raw)
}

export const developmentLimitations = [
  'Development only: independently model-reviewed draft, not qualified human reviewed.',
  'Factual source support and applicable redistribution and training permissions remain unverified.',
]
