const React = require('react')
const { act, create } = require('react-test-renderer')

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(),
  replace: jest.fn(),
}

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))

const { useAppNavigation } = require('../../navigation/useAppNavigation')

function NavigationProbe() {
  const { goBack } = useAppNavigation()
  return React.createElement('NavigationProbe', { goBack })
}

test('goBack uses history when available and replaces with home when opened cold', async () => {
  let view
  await act(async () => {
    view = create(React.createElement(NavigationProbe))
  })

  mockRouter.canGoBack.mockReturnValue(true)
  await act(async () => view.root.findByType('NavigationProbe').props.goBack())
  expect(mockRouter.back).toHaveBeenCalledTimes(1)
  expect(mockRouter.replace).not.toHaveBeenCalled()

  mockRouter.canGoBack.mockReturnValue(false)
  await act(async () => view.root.findByType('NavigationProbe').props.goBack())
  expect(mockRouter.back).toHaveBeenCalledTimes(1)
  expect(mockRouter.replace).toHaveBeenCalledWith('/')

  await act(async () => view.unmount())
})
