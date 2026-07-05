type DownloadsEmptyProps = {
  onGoDiscover: () => void
}

export function DownloadsEmpty({ onGoDiscover }: DownloadsEmptyProps) {
  return (
    <div className="downloads-empty">
      <p className="downloads-empty__title">Sem downloads</p>
      <button className="btn btn-primary downloads-empty__action" type="button" onClick={onGoDiscover}>
        Explorar jogos
      </button>
    </div>
  )
}
