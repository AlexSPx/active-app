import { createContext, useContext } from 'react'

export const TabContentInsetContext = createContext(0)

export function useTabContentInset() {
  return useContext(TabContentInsetContext)
}
