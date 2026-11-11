import { defaultSelection, estimateWorkoutSeconds, planWorkout, renderWorkout, workoutRequestText } from '../../features/coach/workoutPlanner'

const supplied = (request, profile, equipment) => `${request}\nUser-supplied context: ${JSON.stringify({ profile, equipment })}`

test('profile text is treated as data and an overhead-press restriction does not block safe back candidates', () => {
  const message = supplied(
    'Give me a 50-minute routine targeting back, capped at 3 exercises. Available setup: full gym.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['full gym'],
  )

  const result = planWorkout(message)
  expect(result.kind).toBe('plan')
  expect(result.plan.slots.length).toBeGreaterThan(0)
  expect(workoutRequestText(message)).not.toContain('avoid overhead pressing')
})

test('a balanced back cap can use fewer primary regions when one equipment-limited region has no primary option', () => {
  const result = planWorkout(supplied(
    'Give me a 50-minute routine targeting back, capped at 3 exercises. Available setup: full gym. I would like a balanced session.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['full gym'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.plan.slots.length).toBeGreaterThan(0)
  expect(result.plan.assumptions.join(' ')).not.toMatch(/request names 4 muscle groups/i)
})

test('supplied equipment is authoritative when user language mentions another setup', () => {
  const result = planWorkout(supplied(
    'Make a short chest workout. The request text mentions dumbbells, but prioritize the supplied equipment.',
    { trainingAge: 'beginner', limitations: [] },
    ['bodyweight only'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.diagnostics.equipment).toEqual(['BODY_ONLY'])
})

test('beginner barbell request requiring easy scaling clarifies the unknown minimum load', () => {
  const result = planWorkout(supplied(
    'I need a 60-minute routine targeting back, capped at 4 exercises. Make the exercises easy to scale.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['barbell', 'rack', 'bench'],
  ))

  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/unloaded weight/i)
})

test('back plans exclude secondary-only and setup-incompatible exercises when primary options exist', () => {
  const result = planWorkout(supplied(
    'Build me a 15-minute routine targeting back, capped at 2 exercises.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['resistance bands'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.plan.slots).toHaveLength(1)
  const names = result.plan.slots.flat().map(exercise => exercise.name)
  expect(names).not.toContain('Back Flyes - With Bands')
  expect(names).not.toContain('Band Pull Apart')
})

test('beginner single-kettlebell back request asks for load and hinge suitability', () => {
  const result = planWorkout(supplied(
    'Build me a 30-minute routine targeting back, capped at 2 exercises.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['kettlebell'],
  ))

  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/weight/i)
  expect(result.question).toMatch(/hinge/i)
})

test('direct glute targets do not fall through to unrelated whole-body exercises', () => {
  const result = planWorkout(supplied(
    'Design a 35-minute routine targeting glutes, capped at 2 exercises. Available setup: dumbbells, mat.',
    { trainingAge: 'beginner', limitations: [] },
    ['dumbbells', 'mat'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.plan.slots.length).toBeGreaterThan(0)
  expect(result.plan.slots.every(slot => slot[0].primaryMuscles.includes('glutes'))).toBe(true)
})

test('bodyweight catalog instructions that require a bench are excluded unless a bench is available', () => {
  const withoutBench = planWorkout(supplied(
    'Design a 35-minute routine targeting glutes, capped at 2 exercises. Available setup: dumbbells, mat.',
    { trainingAge: 'beginner', limitations: [] },
    ['dumbbells', 'mat'],
  ))
  expect(withoutBench.kind).toBe('plan')
  if (withoutBench.kind !== 'plan') throw new Error('Expected a plan without the bench-dependent option')
  expect(withoutBench.plan.slots.flat().some(exercise => exercise.name === 'Flutter Kicks')).toBe(false)

  const withBench = planWorkout(supplied(
    'Design a 35-minute routine targeting glutes, capped at 2 exercises. Available setup: dumbbells, mat, bench.',
    { trainingAge: 'beginner', limitations: [] },
    ['dumbbells', 'mat', 'bench'],
  ))
  expect(withBench.kind).toBe('plan')
  if (withBench.kind !== 'plan') throw new Error('Expected a plan when a bench is available')
  expect(withBench.plan.slots.flat().some(exercise => exercise.name === 'Flutter Kicks')).toBe(true)
})

test('core can use bodyweight even when the available setup also lists a barbell', () => {
  const result = planWorkout(supplied(
    'Build me a core workout that fits 18 minutes and has 2 exercises. Available setup: barbell, rack, bench. Make the exercises easy to scale.',
    { trainingAge: 'beginner', limitations: [] },
    ['barbell', 'rack', 'bench'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.diagnostics.equipment).toContain('BODY_ONLY')
})

test('a beginner barbell legs request can use an available bodyweight option before asking about bar load', () => {
  const result = planWorkout(supplied(
    'Please write a 40-minute legs session with 6 movements. Available setup: barbell, rack, bench. Make the exercises easy to scale.',
    { trainingAge: 'beginner', limitations: [] },
    ['barbell', 'rack', 'bench'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.plan.slots[0][0].equipment ?? 'BODY_ONLY').toBe('BODY_ONLY')
})

test('neutral-wrist limits offer conditional neutral-grip choices', () => {
  const result = planWorkout(supplied(
    'I need 4 arms exercises for a 45-minute workout. Available setup: dumbbells, bench.',
    { trainingAge: 'beginner', limitations: ['wrist discomfort; keep wrists neutral'] },
    ['dumbbells', 'bench'],
  ))

  expect(result.kind).toBe('plan')
  expect(result.plan.assumptions.join(' ')).toMatch(/conditional.*neutral.*comfortable/i)
})

test('barbell feasibility clarification asks about load, shoulder position, hinge control, and alternatives', () => {
  const result = planWorkout(supplied(
    'I need a 60-minute routine targeting back, capped at 4 exercises. Available setup: barbell, rack, bench. Make the exercises easy to scale. If that exact count is not feasible with the equipment, say so and ask what I can access.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['barbell', 'rack', 'bench'],
  ))

  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/unloaded weight/i)
  expect(result.question).toMatch(/shoulders/i)
  expect(result.question).toMatch(/hip hinge/i)
  expect(result.question).toMatch(/other equipment/i)
})

test('bodyweight back clarification asks for secure support and overhead reach tolerance', () => {
  const result = planWorkout(supplied(
    'I have time for a 40-minute routine targeting back, capped at 5 exercises. Available setup: bodyweight only. Do not use barbell or plates.',
    { trainingAge: 'beginner', limitations: ['avoid overhead pressing'] },
    ['bodyweight only'],
  ))

  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/pull-up bar/i)
  expect(result.question).toMatch(/overhead reaching/i)
})

test('explicit rep-range and cue requests appear in the structured workout response', () => {
  const result = planWorkout(supplied(
    'I need a core workout that fits 40 minutes and has 4 exercises. Available setup: bodyweight only. Please include sets and rep ranges and use straightforward coaching cues.',
    { trainingAge: 'beginner', limitations: [] },
    ['bodyweight only'],
  ))

  expect(result.kind).toBe('plan')
  const response = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(response.kind).toBe('workout_draft')
  if (response.kind !== 'workout_draft') throw new Error('Expected workout draft')
  for (const selection of response.workout.exercises) {
    expect(selection.guidance?.repetitionsRange).toEqual({ min: 8, max: 12 })
    expect(selection.guidance?.cues?.length).toBeGreaterThan(0)
  }
})

test('equipment conflict is explained, and unavailable catalog options prompt for an alternative', () => {
  const feasible = planWorkout(supplied(
    'Build me a 12-minute legs session with 2 movements. I know this conflicts with my listed setup; prioritize the equipment list and explain the limitation rather than using a cable machine. Please include sets and rep ranges.',
    { trainingAge: 'beginner', limitations: [] },
    ['dumbbells', 'bench'],
  ))
  expect(feasible.kind).toBe('plan')
  if (feasible.kind !== 'plan') throw new Error('Expected a plan with the listed equipment')
  expect(feasible.plan.assumptions.join(' ')).toMatch(/cable machine options conflict with the listed setup.*dumbbells, bench/i)
  expect(feasible.plan.partial).toBe(true)
  expect(feasible.plan.assumptions.join(' ')).toMatch(/requested 12-minute session/i)
  expect(feasible.diagnostics.unmetRequirements.join(' ')).not.toMatch(/cable machine/i)
  expect(feasible.plan.slots.flat().every(exercise => ['DUMBBELL', 'BODY_ONLY'].includes(exercise.equipment ?? 'BODY_ONLY'))).toBe(true)

  const infeasible = planWorkout(supplied(
    'Design 2 chest exercises for a 15-minute workout. I know this conflicts with my listed setup; prioritize the equipment list and explain the limitation rather than using a cable machine.',
    { trainingAge: 'beginner', limitations: [] },
    ['resistance bands'],
  ))
  expect(infeasible.kind).toBe('plan')
  expect(infeasible.plan.slots[0][0].equipment).toBe('BODY_ONLY')
  expect(infeasible.plan.assumptions.join(' ')).toMatch(/cable machine options conflict with the listed setup/i)
})

test('core candidates do not repeat sit-up and crunch movement patterns', () => {
  const result = planWorkout(supplied(
    'Give me a core workout that fits 60 minutes and has 3 exercises. Keep transitions simple; I train in a small space.',
    { trainingAge: 'beginner', limitations: ['no jumping'] },
    ['bodyweight only'],
  ))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') throw new Error('Expected a useful core plan')
  const names = defaultSelection(result.plan)
  expect(names.filter(name => /sit.?up|crunch|heel toucher|toe toucher|air bike|hip raise|bottoms up|butt-ups|leg tucks?/i.test(name))).toHaveLength(1)
  expect(result.plan.partial).toBe(false)
})

test('core plans can include multiple flexion movements without truncating the requested count', () => {
  const result = planWorkout(supplied(
    'Please write a core workout that fits 30 minutes and has 6 exercises. Please include sets and rep ranges.',
    { trainingAge: 'beginner', limitations: ['no jumping'] },
    ['dumbbells', 'bench'],
  ))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') throw new Error('Expected a complete core plan')
  const names = defaultSelection(result.plan)
  expect(names).toHaveLength(6)
  expect(new Set(names).size).toBe(6)
  expect(result.plan.partial).toBe(false)
  expect(result.diagnostics.estimatedMinutes).toBeLessThanOrEqual(30)
})

test('dumbbell core sessions retain bodyweight variety and include every requested cue', () => {
  const result = planWorkout(supplied(
    'I need a core workout that fits 40 minutes and has 4 exercises. Use straightforward coaching cues.',
    { trainingAge: 'beginner', limitations: [] },
    ['dumbbells', 'mat'],
  ))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') throw new Error('Expected a core session')
  const response = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(response.kind).toBe('workout_draft')
  if (response.kind !== 'workout_draft') throw new Error('Expected a workout draft')
  expect(response.workout.exercises).toHaveLength(4)
  expect(response.workout.exercises.every(exercise => (exercise.guidance?.cues?.length ?? 0) > 0)).toBe(true)
  expect(defaultSelection(result.plan).filter(name => /sit.?up|crunch|heel toucher|toe toucher|air bike|hip raise|bottoms up|butt-ups/i.test(name))).toHaveLength(1)
})

test('short session estimates include rest and transitions and disclose the budget', () => {
  for (const request of [
    'Help me set up a 25-minute routine targeting glutes, capped at 4 exercises. I only have the stated time including rests.',
    'I need a 18-minute legs session with 4 movements. I only have the stated time including rests.',
  ]) {
    const result = planWorkout(supplied(request, { trainingAge: 'beginner', limitations: [] }, ['no equipment']))
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') throw new Error('Expected a time-bounded partial plan')
    expect(result.diagnostics.estimatedMinutes).toBeLessThanOrEqual(result.diagnostics.durationMinutes)
    expect(result.plan.assumptions.join(' ')).toMatch(/including rest and transitions.*approximate/i)
    expect(result.plan.assumptions.join(' ')).not.toMatch(/working sets only/i)
  }
})

test('requested preparation and reconciled schedule persist with workout drafts', () => {
  const result = planWorkout(supplied('Create a core workout that fits 30 minutes with 2 exercises. Include a warm-up and cool-down.', { trainingAge: 'beginner', limitations: [] }, ['no equipment']))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') return
  const response = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(response.kind).toBe('workout_draft')
  if (response.kind !== 'workout_draft') return
  expect(response.workout.preparation.map(part => part.kind)).toEqual(['warmup', 'cooldown'])
  expect(response.workout.schedule.estimatedSeconds).toBe(estimateWorkoutSeconds(response.workout))
  expect(response.assumptions.join(' ')).toMatch(/including preparation, work, rest, transitions and both sides/i)
})

test('catalog setup requirements are structured and block-only exercises are not silently assumed', () => {
  const { exerciseCatalog } = require('../../lib/exercises/catalog')
  const blockExercise = exerciseCatalog.find(exercise => exercise.setupRequirements?.blocks.length > 0)
  expect(blockExercise).toBeDefined()
  expect(blockExercise.setupRequirements.blocks).toContain('elevated block')
  expect(blockExercise.setupRequirements).toHaveProperty('anchors')
  expect(blockExercise.setupRequirements).toHaveProperty('supports')
  expect(blockExercise.setupRequirements).toHaveProperty('fixedLoadsKg')
})

test('reviewed band anchors and paired kettlebells are represented in catalog setup', () => {
  const { exerciseCatalog } = require('../../lib/exercises/catalog')
  const setup = id => exerciseCatalog.find(exercise => exercise.sourceKey === id).setupRequirements
  expect(setup('Back_Flyes_-_With_Bands').anchors).toContain('fixed post')
  expect(setup('Band_Hip_Adductions').anchors).toContain('fixed post')
  expect(setup('Band_Skull_Crusher')).toMatchObject({ anchors: ['fixed anchor'], supports: ['bench'] })
  expect(setup('Alternating_Floor_Press').minimumEquipmentQuantity).toBe(2)
  const result = planWorkout(supplied('Create 3 chest exercises using a kettlebell.', { trainingAge: 'beginner', limitations: [] }, ['kettlebell']))
  if (result.kind === 'plan') expect(result.plan.slots.flat().map(exercise => exercise.sourceKey)).not.toContain('Alternating_Floor_Press')
})

test('18-minute kettlebell leg plan uses distinct options within the rest-inclusive budget', () => {
  const result = planWorkout(supplied(
    'I need a 18-minute legs session with 4 movements. I only have the stated time including rests.',
    { trainingAge: 'beginner', limitations: [] },
    ['kettlebell'],
  ))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') throw new Error('Expected a time-feasible complete plan')
  expect(defaultSelection(result.plan)).toHaveLength(4)
  expect(new Set(defaultSelection(result.plan)).size).toBe(4)
  expect(result.plan.partial).toBe(false)
  expect(result.plan.sets).toBe(2)
  expect(result.diagnostics.estimatedMinutes).toBeLessThanOrEqual(18)
})

test('balanced leg plans do not repeat squat and lunge variants as separate patterns', () => {
  const result = planWorkout(supplied(
    'I have time for a 35-minute legs session with 5 movements. I would like a balanced session.',
    { trainingAge: 'beginner', limitations: [] },
    ['full gym'],
  ))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') throw new Error('Expected a varied leg plan')
  const names = defaultSelection(result.plan)
  expect(names.filter(name => /squats?|lunges?/i.test(name))).toHaveLength(1)
})

test('knee discomfort in profile context prompts for comfortable movements before lower-body work', () => {
  const result = planWorkout(supplied(
    'Put together a full body workout that fits 18 minutes and has 5 exercises.',
    { trainingAge: 'beginner', limitations: ['mild knee discomfort; avoid painful movements'] },
    ['full gym'],
  ))
  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/which lower-body movements.*comfortable.*squats and lunges/i)
})

test.each([
  ['040', 'Draft a 50-minute routine targeting glutes, capped at 6 exercises. Available setup: dumbbells, bench. I know that conflicts with my listed setup; prioritize the equipment list and explain the limitation rather than using a cable machine. Make the exercises easy to scale.', [], ['dumbbells', 'bench']],
  ['043', 'I need 4 arms exercises for a 45-minute workout. Available setup: dumbbells, bench. Please include sets and rep ranges.', ['wrist discomfort; keep wrists neutral'], ['dumbbells', 'bench']],
  ['091', 'Build me 2 arms exercises for a 20-minute workout. Available setup: full gym. I would like a balanced session.', ['wrist discomfort; keep wrists neutral'], ['full gym']],
  ['139', 'I have time for 5 arms exercises for a 50-minute workout. Available setup: dumbbells, mat.', ['wrist discomfort; keep wrists neutral'], ['dumbbells', 'mat']],
  ['157', 'Give me a core workout that fits 20 minutes and has 3 exercises. Available setup: resistance bands. I prefer a warm-up and a brief cool-down.', ['no jumping'], ['resistance bands']],
  ['196', 'Design 2 chest exercises for a 15-minute workout. Available setup: resistance bands.', ['avoid loaded spinal flexion'], ['resistance bands']],
])('DEV %s returns a useful draft or disclosed partial', (_id, request, limitations, equipment) => {
  const result = planWorkout(supplied(request, { trainingAge: 'beginner', limitations }, equipment))
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') return
  const response = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(response.kind).toBe('workout_draft')
  expect(response.workout.exercises.length).toBeGreaterThan(0)
  if (limitations.some(item => item.includes('wrist'))) expect(response.assumptions.join(' ')).toMatch(/neutral.*comfortable/i)
})

test.each([
  ['091', 'Build me 2 arms exercises for a 20-minute workout. Available setup: full gym. I would like a balanced session.', ['full gym']],
  ['139', 'I have time for 5 arms exercises for a 50-minute workout. Available setup: dumbbells, mat.', ['dumbbells', 'mat']],
])('DEV %s keeps a supported partial without assuming a pair of dumbbells', (_id, request, equipment) => {
  const result = planWorkout(supplied(request, { trainingAge: 'beginner', limitations: ['wrist discomfort; keep wrists neutral'] }, equipment))
  expect(result.kind).toBe('plan')
  const selected = result.plan.slots.map(slot => slot[0])
  expect(selected.length).toBeGreaterThan(0)
  expect(selected.every(exercise => (exercise.setupRequirements.minimumEquipmentQuantity ?? 1) <= 1)).toBe(true)
  expect(result.plan.partial).toBe(true)
  expect(result.plan.assumptions.join(' ')).toMatch(/found .* distinct|not a balanced arm session/i)
  expect(result.plan.assumptions.join(' ')).not.toMatch(/which movements feel comfortable\?/i)
})
