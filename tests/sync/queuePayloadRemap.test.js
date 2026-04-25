const { replaceQueuedIdReferences } = require('../../lib/sync/queuePayloadRemap')

describe('replaceQueuedIdReferences', () => {
  it('rewrites matching ids in nested arrays and objects', () => {
    const payload = [
      'local_workout_1',
      {
        workoutId: 'local_workout_1',
        nested: {
          items: ['keep_me', 'local_workout_1'],
        },
      },
    ]

    const result = replaceQueuedIdReferences(payload, 'local_workout_1', 'server_workout_1')

    expect(result.changed).toBe(true)
    expect(result.value).toEqual([
      'server_workout_1',
      {
        workoutId: 'server_workout_1',
        nested: {
          items: ['keep_me', 'server_workout_1'],
        },
      },
    ])
  })

  it('does not rewrite non-matching strings', () => {
    const payload = {
      workoutId: 'server_workout_1',
      note: 'local_workout_1 is just text here',
    }

    const result = replaceQueuedIdReferences(payload, 'local_workout_1', 'server_workout_1')

    expect(result.changed).toBe(false)
    expect(result.value).toBe(payload)
  })
})
