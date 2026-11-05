const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('../../stores/authStore', () => ({
  useAuthStore: require('zustand').create(() => ({ profileOwnerId: 'account:A' })),
}))

const { useAuthStore } = require('../../stores/authStore')
const { useProfileQueryKeys } = require('../../lib/hooks/useProfileQueryKeys')

test('profile keys follow owner changes and retain the owner captured by pending work', async () => {
  let keys
  function Probe() {
    keys = useProfileQueryKeys()
    return null
  }

  let view
  act(() => {
    view = create(React.createElement(Probe))
  })
  try {
    const originKeys = keys
    act(() => view.update(React.createElement(Probe)))
    expect(keys).toBe(originKeys)

    let complete
    const pending = new Promise((resolve) => (complete = resolve))
    const lateResult = pending.then(() => originKeys.records.list())

    act(() => useAuthStore.setState({ profileOwnerId: 'account:B' }))
    expect(keys.records.list()).toEqual(['profile', 'account:B', 'records', 'list'])
    complete()
    await expect(lateResult).resolves.toEqual(['profile', 'account:A', 'records', 'list'])
  } finally {
    act(() => view.unmount())
  }
})
