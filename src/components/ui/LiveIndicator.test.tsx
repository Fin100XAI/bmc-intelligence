import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveIndicator } from './LiveIndicator'

/**
 * `LiveIndicator` deliberately ticks against the real wall clock rather than
 * the frozen `DEMO_NOW` anchor (see the component's own doc comment) - these
 * tests exist mainly to pin that choice down, since a future edit that
 * quietly switched it to `formatRelative`/`DEMO_NOW` would compile fine and
 * only be wrong once it renders "eight days ago" a second after a poll.
 */
describe('LiveIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads "Updated just now" immediately after the data landed', () => {
    const now = Date.parse('2026-08-18T10:00:00.000Z')
    vi.setSystemTime(now)
    render(<LiveIndicator dataUpdatedAt={now} isFetching={false} />)
    expect(screen.getByText('Updated just now')).toBeInTheDocument()
  })

  it('counts real seconds elapsed since dataUpdatedAt, ticking every second', () => {
    const now = Date.parse('2026-08-18T10:00:00.000Z')
    vi.setSystemTime(now)
    render(<LiveIndicator dataUpdatedAt={now} isFetching={false} />)

    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(screen.getByText('Updated 12s ago')).toBeInTheDocument()
  })

  it('never goes negative if dataUpdatedAt is momentarily ahead of the tick clock', () => {
    const now = Date.parse('2026-08-18T10:00:00.000Z')
    vi.setSystemTime(now)
    // dataUpdatedAt one second in the "future" relative to render time.
    render(<LiveIndicator dataUpdatedAt={now + 1000} isFetching={false} />)
    expect(screen.getByText('Updated just now')).toBeInTheDocument()
  })
})
