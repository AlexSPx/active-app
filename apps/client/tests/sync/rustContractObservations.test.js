const {
  exerciseSchema,
  workoutRecordResponseSchema,
  workoutRecordSchema,
} = require('../../lib/schemas/api')
const fixtures = require('../../../../contracts/active-api/v1/client-parser-observations.json')

describe('Rust contract migration observations', () => {
  it('exposes current parser gaps rather than treating proposed payloads as compatible', () => {
    expect(exerciseSchema.safeParse(fixtures.catalogItem).success).toBe(false)
    expect(workoutRecordResponseSchema.safeParse(fixtures.recordWithoutStreak).success).toBe(false)
    expect(workoutRecordSchema.safeParse(fixtures.recordWithDeletedWorkout).success).toBe(false)
  })

  it('demonstrates that the current exercise parser drops source identity', () => {
    const parsed = exerciseSchema.parse({ ...fixtures.catalogItem, level: 'BEGINNER' })
    expect(parsed).not.toHaveProperty('sourceKey')
    expect(parsed).not.toHaveProperty('retired')
  })
})
