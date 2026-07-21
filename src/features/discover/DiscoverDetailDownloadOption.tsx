import type { DownloadOption } from '../../shared/types/contracts'
import {
  pickOptionLabel,
  pickOptionMeta,
  pickOptionVariantLabel,
} from '../../shared/utils/pickDownloadOptions'

type DiscoverDetailDownloadOptionProps = {
  opt: DownloadOption
  index: number
  gameTitle: string
  busy: boolean
  downloadCoverUrl: string | null
  onDownload: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  downloadLabel: string
}

export function DiscoverDetailDownloadOption({
  opt,
  index,
  gameTitle,
  busy,
  downloadCoverUrl,
  onDownload,
  downloadLabel,
}: DiscoverDetailDownloadOptionProps) {
  const fullTitle = pickOptionLabel(opt)
  const variant = pickOptionVariantLabel(opt, gameTitle)
  const meta = pickOptionMeta(opt)
  return (
    <li key={`${opt.url}-${index}`}>
      <div className="discover-detail__option" title={fullTitle}>
        <span className="discover-detail__option-main">
          <span className="discover-detail__option-variant">{variant}</span>
          <span className="discover-detail__option-meta">
            <span>{meta.source}</span>
            {meta.size ? <span>{meta.size}</span> : null}
            <span>{meta.downloadType}</span>
          </span>
        </span>
        <button
          type="button"
          className="discover-detail__option-action"
          disabled={busy}
          onClick={() => void onDownload(opt.title, opt.url, downloadCoverUrl)}
        >
          {busy ? '…' : downloadLabel}
        </button>
      </div>
    </li>
  )
}
