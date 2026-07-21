import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual'
import { LibraryGridCard, type LibraryGridCardModel } from './LibraryGridCard'
import { LIBRARY_ROW_GAP } from './libraryGridLayout'

type Props = {
  rows: VirtualItem[]
  models: LibraryGridCardModel[]
  columns: number
  colGap: number
  virtualizer: Virtualizer<HTMLElement, Element>
}

export function VirtualizedLibraryRows({
  rows,
  models,
  columns,
  colGap,
  virtualizer,
}: Props) {
  return rows.map((row) => {
    const startIndex = row.index * columns
    const rowModels = models.slice(startIndex, startIndex + columns)
    return (
      <div
        key={row.key}
        data-index={row.index}
        ref={virtualizer.measureElement}
        className="library-grid__row"
        role="presentation"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start}px)`,
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${LIBRARY_ROW_GAP}px ${colGap}px`,
          alignItems: 'start',
          paddingBottom: LIBRARY_ROW_GAP,
          boxSizing: 'border-box',
        }}
      >
        {rowModels.map((model, colIndex) => (
          <LibraryGridCard
            key={models[startIndex + colIndex]?.item.id ?? startIndex + colIndex}
            model={model}
            className="library-grid__item"
          />
        ))}
      </div>
    )
  })
}
