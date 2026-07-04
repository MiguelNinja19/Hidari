import type { ChangeEvent } from 'react'

type SearchInputProps = {
  value: string
  placeholder: string
  className?: string
  inputClassName?: string
  onChange: (value: string) => void
}

export function SearchInput({
  value,
  placeholder,
  className = 'browse-search',
  inputClassName = 'browse-search__input',
  onChange,
}: SearchInputProps) {
  return (
    <div className={className}>
      <span className="browse-search__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      </span>
      <input
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
