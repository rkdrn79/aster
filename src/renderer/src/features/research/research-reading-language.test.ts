// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { useReadingLanguage } from './research-reading-language'

afterEach(async () => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  await act(() => i18n.changeLanguage('en'))
})

describe('Reading language', () => {
  it('defaults to the UI language rather than the OS locale, and follows it', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ko-KR')
    const { result } = renderHook(() => useReadingLanguage())
    expect(result.current[0]).toBe('en')
    await act(() => i18n.changeLanguage('ko'))
    expect(result.current[0]).toBe('ko')
  })

  it('keeps an explicit choice over the UI language, across remounts', async () => {
    const first = renderHook(() => useReadingLanguage())
    act(() => first.result.current[1]('ja'))
    expect(first.result.current[0]).toBe('ja')
    first.unmount()
    await act(() => i18n.changeLanguage('ko'))
    const { result } = renderHook(() => useReadingLanguage())
    expect(result.current[0]).toBe('ja')
  })

  it('answers in English when the UI language is not a reading language', async () => {
    await act(() => i18n.changeLanguage('pt'))
    const { result } = renderHook(() => useReadingLanguage())
    expect(result.current[0]).toBe('en')
  })

  it('is one setting: a choice on one page reaches every other user at once', () => {
    const library = renderHook(() => useReadingLanguage())
    const rebuttal = renderHook(() => useReadingLanguage())
    act(() => rebuttal.result.current[1]('ko'))
    expect(library.result.current[0]).toBe('ko')
    expect(window.localStorage.getItem('aster.library.readingLanguage')).toBe('ko')
  })
})
