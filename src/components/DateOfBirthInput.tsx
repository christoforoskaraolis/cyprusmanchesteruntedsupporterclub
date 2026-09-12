import { useEffect, useMemo, useRef, useState } from 'react'

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
] as const

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

const MIN_YEAR = 1920

function maxSelectableYear(): number {
  return new Date().getFullYear()
}

function yearOptions(): number[] {
  const max = maxSelectableYear()
  const years: number[] = []
  for (let y = max; y >= MIN_YEAR; y -= 1) years.push(y)
  return years
}

function parseIsoParts(value: string): { day: number; month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const dob = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null
  return { year, month, day }
}

function toIsoDate(day: number, month: number, year: number): string {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return ''
  if (year < MIN_YEAR || year > maxSelectableYear()) return ''
  if (month < 1 || month > 12) return ''
  if (day < 1 || day > 31) return ''
  const dob = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return ''
  if (dob.getTime() > Date.now()) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0, 12, 0, 0, 0).getDate()
}

/** Monday-first index for the first day of the month (0 = Monday). */
function mondayFirstWeekday(year: number, month: number): number {
  const sundayBased = new Date(year, month - 1, 1, 12, 0, 0, 0).getDay()
  return (sundayBased + 6) % 7
}

function formatDisplay(iso: string): string {
  const parts = parseIsoParts(iso)
  if (!parts) return ''
  const monthLabel = MONTH_OPTIONS.find((m) => m.value === parts.month)?.label ?? String(parts.month)
  return `${String(parts.day).padStart(2, '0')} ${monthLabel} ${parts.year}`
}

type DateOfBirthInputProps = {
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  name?: string
  id?: string
}

export function DateOfBirthInput({ value, onChange, disabled, name, id }: DateOfBirthInputProps) {
  const selected = useMemo(() => parseIsoParts(value), [value])
  const years = useMemo(() => yearOptions(), [])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  const today = new Date()
  const [viewYear, setViewYear] = useState(selected?.year ?? 1980)
  const [viewMonth, setViewMonth] = useState(selected?.month ?? 1)

  useEffect(() => {
    if (!selected) return
    setViewYear(selected.year)
    setViewMonth(selected.month)
  }, [selected?.year, selected?.month])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const dayCount = daysInMonth(viewYear, viewMonth)
  const leadingBlanks = mondayFirstWeekday(viewYear, viewMonth)
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function selectDay(day: number) {
    const iso = toIsoDate(day, viewMonth, viewYear)
    if (!iso) return
    onChange(iso)
    setOpen(false)
  }

  function isFutureDay(day: number): boolean {
    const candidate = new Date(viewYear, viewMonth - 1, day, 23, 59, 59, 999)
    return candidate.getTime() > Date.now()
  }

  function shiftMonth(delta: number) {
    const base = new Date(viewYear, viewMonth - 1 + delta, 1, 12, 0, 0, 0)
    const nextYear = Math.min(maxSelectableYear(), Math.max(MIN_YEAR, base.getFullYear()))
    setViewYear(nextYear)
    setViewMonth(base.getMonth() + 1)
  }

  return (
    <div className="dob-input" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="auth-input dob-input-trigger"
        name={name}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
        }}
      >
        {selected ? formatDisplay(value) : 'Choose date of birth'}
      </button>

      {open && !disabled ? (
        <div className="dob-calendar" role="dialog" aria-label="Choose date of birth">
          <div className="dob-calendar-header">
            <button type="button" className="dob-calendar-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <div className="dob-calendar-selects">
              <label className="dob-calendar-select-wrap">
                <span className="visually-hidden">Month</span>
                <select
                  className="auth-input dob-calendar-select"
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                >
                  {MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dob-calendar-select-wrap">
                <span className="visually-hidden">Year</span>
                <select
                  className="auth-input dob-calendar-select dob-calendar-select--year"
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="dob-calendar-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>

          <div className="dob-calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="dob-calendar-grid">
            {cells.map((day, index) => {
              if (day == null) {
                return <span key={`empty-${index}`} className="dob-calendar-day is-empty" />
              }
              const disabledDay = isFutureDay(day)
              const isSelected =
                selected != null &&
                selected.year === viewYear &&
                selected.month === viewMonth &&
                selected.day === day
              const isToday =
                today.getFullYear() === viewYear &&
                today.getMonth() + 1 === viewMonth &&
                today.getDate() === day
              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  className={`dob-calendar-day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  disabled={disabledDay}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {selected ? (
            <p className="dob-input-preview">Selected: {formatDisplay(value)}</p>
          ) : (
            <p className="dob-input-preview">Pick a year from the list, then choose the day.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
