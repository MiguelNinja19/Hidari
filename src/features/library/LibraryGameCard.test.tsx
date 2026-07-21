import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createPortal } from 'react-dom'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: vi.fn((node: React.ReactNode) => node),
  }
})

import { LibraryGameCard } from './LibraryGameCard'

describe('LibraryGameCard menu portal', () => {
  it('abre o menu via createPortal no clique direito', async () => {
    render(
      <LibraryGameCard
        title="Galaxy Rangers"
        cover={<span>cover</span>}
        secondaryActions={[
          {
            id: 'open',
            label: 'Open folder',
            onClick: () => undefined,
          },
        ]}
      />,
    )

    const card = screen.getByRole('article', { name: 'Galaxy Rangers' })
    fireEvent.contextMenu(card, { clientX: 120, clientY: 80 })

    expect(createPortal).toHaveBeenCalled()
    expect(await screen.findByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Open folder' })).toBeTruthy()
  })
})
