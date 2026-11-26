const fs = require('node:fs')
const { coachInstructions } = require('../../apps/client/features/coach/prompts')
const { evaluate } = require('./production.cjs')

async function compile(row) {
  const messages = [{ role: 'system', content: coachInstructions }]
  const examples = []
  let adviceIndex = 0
  let selectionError
  const answers = [...(row.prior ?? []).map(turn => turn.answer), row.answer]
  const session = {
    async appendUserMessage(content) {
      messages.push({ role: 'user', content })
    },
    async generate({ finalResponseSchema }) {
      let value
      if (finalResponseSchema.properties.intent) {
        value = { intent: row.group === 'workout' ? 'create_workout' : 'coach_qa' }
      } else if (finalResponseSchema.properties.text) {
        value = { text: answers[adviceIndex++] }
        if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 750)
          throw new Error('Missing or oversized advice target')
      } else if (finalResponseSchema.properties.sessions) {
        const prompt = messages.at(-1).content
        const slots = JSON.parse(prompt.split('Session slots: ').at(-1).split('. Validation errors:')[0].trim().replace(/\.$/, ''))
        if (row.prior?.length || slots.length !== row.priorities.length)
          throw new Error('Incorrect session count in reference')
        value = { sessions: Object.fromEntries(slots.map(({ day, slots }, index) => {
          const chosen = row.priorities[index]
          if (chosen.length !== slots.length || new Set(chosen).size !== chosen.length ||
              chosen.some((name, slot) => !slots[slot].includes(name))) {
            selectionError = new Error(`Reference choices unavailable in ${day}: ${JSON.stringify({ chosen, slots })}`)
            throw selectionError
          }
          return [day, { selections: Object.fromEntries(chosen.map((name, slot) => [`slot_${slot + 1}`, name])) }]
        })) }
      } else {
        throw new Error('Unexpected model call')
      }
      const content = JSON.stringify(value)
      const assistant = { role: 'assistant', content }
      examples.push({ id: `${row.id}:${examples.length + 1}`, group: row.group, messages: [...messages, assistant] })
      messages.push(assistant)
      return { kind: 'final', content: value }
    },
  }
  const result = await evaluate(0, 0, { ...row, expected: row.priorities?.length > 1 ? 'routine_draft' : 'workout_draft' }, session)
  if (selectionError) throw selectionError
  if (!result.schema || result.constraints === false || (row.group === 'coaching' && adviceIndex !== answers.length) ||
      result.result.response.assumptions?.some(value => value.includes('Model selection was unavailable')))
    throw new Error(JSON.stringify({ result: result.result, failures: result.failures }))
  return examples
}

async function main() {
  const [source, target] = process.argv.slice(2)
  const rows = fs.readFileSync(source, 'utf8').trim().split('\n').map(JSON.parse)
  const examples = []
  let rejected = 0
  for (const row of rows) {
    try {
      examples.push(...await compile(row))
    } catch (error) {
      rejected++
      console.error(row.id, error.message)
    }
  }
  if (!examples.length) throw new Error('No production-compatible targets')
  fs.writeFileSync(target, examples.map(value => JSON.stringify(value)).join('\n') + '\n')
  console.log(JSON.stringify({ sourceRows: rows.length, rejected, examples: examples.length }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
