const {
  exerciseSchema,
  workoutRecordResponseSchema,
  workoutRecordSchema,
} = require('../../lib/schemas/api')
const fixtures = require('../../../../contracts/v1/client-parser-observations.json')

describe('Rust contract migration observations', () => {
  it('accepts catalog metadata while retaining other parser gaps', () => {
    expect(exerciseSchema.safeParse(fixtures.catalogItem).success).toBe(true)
    expect(workoutRecordResponseSchema.safeParse(fixtures.recordWithoutStreak).success).toBe(false)
    expect(workoutRecordSchema.safeParse(fixtures.recordWithDeletedWorkout).success).toBe(false)
  })

  it('preserves catalog source identity', () => {
    const parsed = exerciseSchema.parse({ ...fixtures.catalogItem, level: 'BEGINNER' })
    expect(parsed).toHaveProperty('sourceKey', 'barbell-squat')
    expect(parsed).toHaveProperty('retired', false)
  })
})
