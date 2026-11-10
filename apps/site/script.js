const tabs = [...document.querySelectorAll('[role="tab"]')]

function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab
    item.setAttribute('aria-selected', String(selected))
    item.tabIndex = selected ? 0 : -1
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected
  }
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab))
  tab.addEventListener('keydown', (event) => {
    let next
    if (event.key === 'ArrowDown') next = (index + 1) % tabs.length
    if (event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next === undefined) return
    event.preventDefault()
    selectTab(tabs[next])
    tabs[next].focus()
  })
}

const setButtons = [...document.querySelectorAll('.set-check')]
for (const button of setButtons) {
  button.addEventListener('click', () => {
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'))
    const complete = setButtons.filter(
      (item) => item.getAttribute('aria-pressed') === 'true'
    ).length
    document.querySelector('.set-feedback').textContent =
      complete === setButtons.length
        ? '3 of 3 sets complete. A little stronger than before.'
        : `${complete} of 3 sets complete. Tap a set to update it.`
  })
}
