export function shouldFollowCoachMessages(offset: number, viewportHeight: number, contentHeight: number) {
  return contentHeight - (offset + viewportHeight) <= 80
}
