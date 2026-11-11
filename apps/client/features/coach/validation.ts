import { coachResponseSchema, type CoachResponse } from './contracts'

export type CoachValidationResult =
  | { success: true; response: CoachResponse }
  | { success: false; issues: string[] }

export function validateCoachResponse(
  input: unknown,
  options: { personalHistoryRequest?: boolean } = {}
): CoachValidationResult {
  const parsed = coachResponseSchema.safeParse(input)
  if (parsed.success) {
    const response = parsed.data
    const issues: string[] = []
    // shortcut: only recorded request-only surroundings qualify; broaden after reviewing structured claims.
    const formatRequest = response.kind === 'answer' && response.blocks.length === 1 &&
      response.blocks[0].kind === 'text' && response.limitations.every((limitation) => [
        'I cannot access external tools or databases without explicit user input.',
        'I do not have access to any personal training history, metrics, or exercise catalogs beyond what you provide in the current session.',
        'I can only access training history from the specified timestamps.',
        'I cannot generate new workout plans or modify existing ones.',
        'I will not invent records, metrics, exercise IDs, or sources.',
        "For unknown loads in my analysis, I will use 'user_selected' as the value.",
      ].includes(limitation))
    const checkText = (text: string, allowFormatRequest = false) => {
      // shortcut: lexical detection cannot establish free-text entailment; replace with reviewed structured claims.
      const numberSource = String.raw`(?:\d+(?:[.,]\d+)?|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozen|hundred|thousand)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)`
      const number = new RegExp(String.raw`\b${numberSource}\b`, 'i')
      const personalHistory = new RegExp(
        String.raw`\b(?:(?:you|i|we)(?:'ve| have| had| did| were| completed| logged| recorded| trained| exercised| lifted| ran| spent| performed| did not| didn't)|your\s+(?:${numberSource}\s+)?(?:(?:recent|latest|last|previous|completed|logged|recorded|consecutive)\s+)*(?:history|workouts?|sessions?|records?|training|performance|total|average|progress|reps?|sets?|weight|volume)|(?:you|your)\b.{0,80}\b(?:last|previous|ago|completed|logged|recorded|history))\b`,
        'i'
      )
      const withoutFormatExamples = !allowFormatRequest ? text : text
        .replace(
          /^(?:Please provide the start and end timestamps \(in ISO 8601 format, e\.g\., YYYY-MM-DDTHH:MM:SSZ\) for the period you would like me to review\. This will help me filter your training history accurately\.|To ensure I can accurately filter your training history and provide personalized guidance based on your actual metrics, please specify the start and end timestamps in ISO 8601 format \(e\.g\., YYYY-MM-DDTHH:MM:SSZ\)\. This will allow me to retrieve relevant data from your records\.)$/,
          'Please provide timestamps.'
        )
        .replace(
          /^Please provide the start and end timestamps you'd like me to analyze\. For example: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z' to '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z'\.$/,
          'Please provide timestamps.'
        )
      if (
        number.test(withoutFormatExamples) &&
        (personalHistory.test(text) || options.personalHistoryRequest)
      )
        issues.push('Personal numerical history must use a computed metric block.')
    }
    if (response.kind === 'answer') {
      for (const block of response.blocks) {
        if (block.kind === 'text') {
          checkText(block.text, formatRequest)
          if (block.evidence.some((ref) => ref.kind !== 'knowledge'))
            issues.push('Text evidence may cite only retrieved knowledge card IDs with kind knowledge. For personal numerical history use a metric block with a returned metricId; record, workout and metric references cannot ground free text.')
        }
      }
      response.limitations.forEach((limitation) => checkText(limitation))
    } else if (response.kind === 'clarification') checkText(response.question)
    else if (response.kind === 'cannot_fulfill') checkText(response.reason)
    else response.assumptions.forEach((assumption) => checkText(assumption))
    return issues.length ? { success: false, issues } : { success: true, response }
  }
  return {
    success: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`
    ),
  }
}
