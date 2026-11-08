const {
  prepareAccountProfileInitialization: prepare,
  executeAccountProfileInitialization: execute,
  prepareAccountProfileDeletion: prepareDelete,
  executeAccountProfileDeletion: executeDelete,
} = require('../../lib/repositories/accountProfileV1')
const profile = {
  id: 'account-a',
  email: 'a@example.com',
  username: 'user_123',
  firstName: 'User',
  lastName: 'User',
  createdAt: '2026-01-01T00:00:00Z',
  timezone: null,
  activeRoutineId: null,
  measurements: null,
  registrationCompleted: false,
  profileVersion: 1,
}
const device = {
  firstName: 'Alex',
  lastName: 'Smith',
  timezone: 'Europe/Sofia',
  measurements: { weightKg: 75, heightCm: 180 },
  registrationCompleted: true,
}
const preferences = { enabled: true, schedule: ['09:00'], timezone: 'Europe/Sofia' }
const input = () => ({
  accountId: profile.id,
  profile,
  device,
  profileKey: 'profile-key',
  preferences: { kind: 'absent', device: preferences, key: 'preferences-key' },
})
const copy = (value) => JSON.parse(JSON.stringify(value))

test('resumes preferences from a serialized checkpoint after failure and profile refresh', async () => {
  const plan = prepare(input())
  const updated = { ...profile, ...device, profileVersion: 2 }
  const call = jest
    .fn()
    .mockResolvedValueOnce(updated)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...preferences, version: 1 })
  const checkpoint = await execute({ call, accountId: profile.id, plan: copy(plan) })
  await expect(execute({ call, accountId: profile.id, plan: checkpoint })).rejects.toThrow(
    'offline'
  )
  expect(() => prepare({ ...input(), profile: updated })).toThrow()
  expect((await execute({ call, accountId: profile.id, plan: copy(checkpoint) })).stage).toBe(
    'complete'
  )
  expect(call.mock.calls).toEqual([
    [
      'profile.update',
      { path: {}, query: {}, idempotencyKey: 'profile-key', body: { baseVersion: 1, ...device } },
    ],
    [
      'preferences.put',
      {
        path: {},
        query: {},
        idempotencyKey: 'preferences-key',
        body: { baseVersion: 0, ...preferences },
      },
    ],
    [
      'preferences.put',
      {
        path: {},
        query: {},
        idempotencyKey: 'preferences-key',
        body: { baseVersion: 0, ...preferences },
      },
    ],
  ])
})

test('replays the original profile request after response loss and snapshots input', async () => {
  const values = input()
  values.device = copy(device)
  values.preferences.device = copy(preferences)
  const plan = prepare(values)
  values.device.measurements.weightKg = 99
  values.preferences.device.schedule.push('10:00')
  const call = jest
    .fn()
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ ...profile, ...device })
  await expect(execute({ call, accountId: profile.id, plan })).rejects.toThrow('response lost')
  await execute({ call, accountId: profile.id, plan: copy(plan) })
  expect(call.mock.calls[0]).toEqual(call.mock.calls[1])
  expect(call.mock.calls[0][1].body.measurements.weightKg).toBe(75)
  expect(plan.preferences.body.schedule).toEqual(['09:00'])
})

test('validates both payloads and keys before dispatch', () => {
  expect(() =>
    prepare({
      ...input(),
      preferences: { kind: 'absent', device: { ...preferences, schedule: ['bad'] }, key: 'key' },
    })
  ).toThrow()
  expect(() => prepare({ ...input(), device: { ...device, firstName: '' } })).toThrow()
  expect(() => prepare({ ...input(), profileKey: '' })).toThrow()
  expect(() =>
    prepare({ ...input(), preferences: { kind: 'absent', device: preferences, key: '' } })
  ).toThrow()
})

test.each([
  { id: 'other' },
  { profileVersion: 2 },
  { registrationCompleted: true },
  { firstName: 'Existing' },
  { lastName: 'Existing' },
  { timezone: 'UTC' },
  { measurements: { weightKg: 75, heightCm: 180 } },
])('rejects non-placeholder or wrong owner: %o', (change) => {
  expect(() => prepare({ ...input(), profile: { ...profile, ...change } })).toThrow()
})

test('skips existing preferences and checks owner at execution and in the response', async () => {
  const plan = prepare({ ...input(), preferences: { kind: 'present' } })
  const call = jest
    .fn()
    .mockResolvedValueOnce({ ...profile, id: 'other' })
    .mockResolvedValueOnce({ ...profile, ...device })
  await expect(execute({ call, accountId: 'other', plan })).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  await expect(execute({ call, accountId: profile.id, plan })).rejects.toThrow()
  expect((await execute({ call, accountId: profile.id, plan })).stage).toBe('complete')
  expect(call).toHaveBeenCalledTimes(2)
})

test('deletion replays the persisted DELETE directly after response loss', async () => {
  const plan = prepareDelete({
    accountId: profile.id,
    profile,
    profileVersion: 1,
    key: 'delete-key',
  })
  const call = jest
    .fn()
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ deletedUserId: profile.id })
  await expect(executeDelete({ call, accountId: profile.id, plan })).rejects.toThrow(
    'response lost'
  )
  await executeDelete({ call, accountId: profile.id, plan: copy(plan) })
  expect(call.mock.calls).toEqual(
    Array(2).fill([
      'profile.delete',
      { path: {}, query: { baseVersion: 1 }, body: null, idempotencyKey: 'delete-key' },
    ])
  )
})

test('deletion rejects wrong owner, version, key and mismatched response', async () => {
  const args = { accountId: profile.id, profile, profileVersion: 1, key: 'key' }
  expect(() => prepareDelete({ ...args, accountId: 'other' })).toThrow()
  expect(() => prepareDelete({ ...args, profileVersion: 2 })).toThrow()
  expect(() =>
    prepareDelete({ ...args, profileVersion: 0, profile: { ...profile, profileVersion: 0 } })
  ).toThrow()
  expect(() => prepareDelete({ ...args, key: '' })).toThrow()
  const plan = prepareDelete(args)
  const call = jest.fn().mockResolvedValue({ deletedUserId: 'other' })
  await expect(executeDelete({ call, accountId: 'other', plan })).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  await expect(executeDelete({ call, accountId: profile.id, plan })).rejects.toThrow()
})
