const {
  switchPatternDraft,
  applyWorkoutSelection,
  toggleWorkoutSelection,
  routineValidation,
  workoutMetadata,
} = require('../../features/routines/routineDraft')

test('pattern drafts and pending search selections survive switching without accepting incomplete sessions', () => {
  const cycle = [
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: 'upper' },
    { dayIndex: 2, dayType: 'REST', workoutId: null },
  ]
  let drafts = { SEQUENTIAL: cycle, WEEKLY_COMPLETION: null }
  drafts = switchPatternDraft(drafts, 'SEQUENTIAL', cycle, 'WEEKLY_COMPLETION')
  expect(drafts.WEEKLY_COMPLETION).toEqual([cycle[0]])

  let pending = toggleWorkoutSelection(['upper'], 'lower', false)
  expect(pending).toEqual(['upper', 'lower'])
  expect(cycle).toHaveLength(2)
  const weekly = applyWorkoutSelection(drafts.WEEKLY_COMPLETION, pending)
  drafts = switchPatternDraft(drafts, 'WEEKLY_COMPLETION', weekly, 'SEQUENTIAL')
  expect(drafts.SEQUENTIAL).toEqual(cycle)
  expect(
    switchPatternDraft(drafts, 'SEQUENTIAL', cycle, 'WEEKLY_COMPLETION').WEEKLY_COMPLETION
  ).toEqual(weekly)
  expect(toggleWorkoutSelection(pending, 'lower', true)).toEqual(['lower'])
  expect(applyWorkoutSelection(weekly, ['lower'])).toEqual([
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: 'lower' },
  ])

  const data = {
    name: 'Strength',
    description: '',
    routineType: 'SEQUENTIAL',
    pattern: cycle,
    active: false,
    startDate: new Date('2026-10-01'),
  }
  expect(routineValidation(data, ['upper', 'lower'])).toBe('')
  expect(routineValidation({ ...data, name: '   ' }, ['upper'])).toMatch(/name/)
  expect(routineValidation({ ...data, pattern: [cycle[1]] }, ['upper'])).toMatch(/training/)
  expect(routineValidation(data, [])).toMatch(/day 1/)
  expect(
    routineValidation({ ...data, pattern: [{ ...cycle[0], workoutId: null }] }, ['upper'])
  ).toMatch(/day 1/)
  expect(routineValidation({ ...data, description: 'a'.repeat(501) }, ['upper'])).toMatch(/500/)
  expect(
    workoutMetadata({
      workoutTemplate: { exercises: [{ category: 'CARDIO', durationSeconds: [600, 300] }] },
    })
  ).toBe('2 intervals · ~15 min')
})
