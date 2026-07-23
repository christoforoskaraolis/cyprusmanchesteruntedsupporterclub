import { useEffect, useMemo, useState } from 'react'

const MONTH_OPTIONS = [
  { value: 1, label: '01 - JAN' },
  { value: 2, label: '02 - FEB' },
  { value: 3, label: '03 - MAR' },
  { value: 4, label: '04 - APR' },
  { value: 5, label: '05 - MAY' },
  { value: 6, label: '06 - JUN' },
  { value: 7, label: '07 - JUL' },
  { value: 8, label: '08 - AUG' },
  { value: 9, label: '09 - SEP' },
  { value: 10, label: '10 - OCT' },
  { value: 11, label: '11 - NOV' },
  { value: 12, label: '12 - DEC' },
] as const

function parseIsoParts(value: string): { day: string; month: string; year: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return { day: '', month: '', year: '' }
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) }
}

function toIsoDate(dayRaw: string, monthRaw: string, yearRaw: string): string {
  const day = Number(dayRaw)
  const month = Number(monthRaw)
  const year = Number(yearRaw)
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return ''
  if (year < 1900 || year > 2100) return ''
  if (month < 1 || month > 12) return ''
  if (day < 1 || day > 31) return ''
  const dob = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDmyText(raw: string): { day: string; month: string; year: string } | null {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw.trim())
  if (!match) return null
  return {
    day: String(Number(match[1])),
    month: String(Number(match[2])),
    year: match[3],
  }
}

type DateOfBirthInputProps = {
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  name?: string
  id?: string
}

export function DateOfBirthInput({ value, onChange, disabled, name, id }: DateOfBirthInputProps) {
  const initial = useMemo(() => parseIsoParts(value), [value])
  const [day, setDay] = useState(initial.day)
  const [month, setMonth] = useState(initial.month)
  const [year, setYear] = useState(initial.year)
  const [typedDmy, setTypedDmy] = useState('')

  useEffect(() => {
    if (!value.trim()) return
    const next = parseIsoParts(value)
    setDay(next.day)
    setMonth(next.month)
    setYear(next.year)
  }, [value])

  function emit(nextDay: string, nextMonth: string, nextYear: string) {
    if (!nextDay && !nextMonth && !nextYear) {
      onChange('')
      return
    }
    const iso = toIsoDate(nextDay, nextMonth, nextYear)
    if (iso) onChange(iso)
  }

  function applyTypedDmy() {
    const parsed = parseDmyText(typedDmy)
    if (!parsed) return
    setDay(parsed.day)
    setMonth(parsed.month)
    setYear(parsed.year)
    setTypedDmy('')
    emit(parsed.day, parsed.month, parsed.year)
  }

  const preview =
    day && month && year
      ? `${String(day).padStart(2, '0')} / ${MONTH_OPTIONS.find((m) => String(m.value) === month)?.label ?? month} / ${year}`
      : null

  return (
    <div className="dob-input">
      <div className="dob-input-row" role="group" aria-label="Date of birth">
        <label className="dob-input-part">
          <span className="dob-input-part-label">DD</span>
          <input
            id={id}
            className="auth-input dob-input-day"
            type="text"
            inputMode="numeric"
            name={name ? `${name}-day` : undefined}
            placeholder="15"
            maxLength={2}
            disabled={disabled}
            value={day}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 2)
              setDay(next)
              emit(next, month, year)
            }}
          />
        </label>
        <label className="dob-input-part dob-input-part--month">
          <span className="dob-input-part-label">Month</span>
          <select
            className="auth-input dob-input-month"
            name={name ? `${name}-month` : undefined}
            disabled={disabled}
            value={month}
            onChange={(e) => {
              const next = e.target.value
              setMonth(next)
              emit(day, next, year)
            }}
          >
            <option value="">MM - MON</option>
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dob-input-part">
          <span className="dob-input-part-label">YYYY</span>
          <input
            className="auth-input dob-input-year"
            type="text"
            inputMode="numeric"
            name={name ? `${name}-year` : undefined}
            placeholder="1970"
            maxLength={4}
            disabled={disabled}
            value={year}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 4)
              setYear(next)
              emit(day, month, next)
            }}
          />
        </label>
      </div>

      <label className="dob-input-typed">
        <span className="dob-input-part-label">Or type DD/MM/YYYY</span>
        <input
          className="auth-input"
          type="text"
          inputMode="numeric"
          placeholder="15/10/1970"
          disabled={disabled}
          value={typedDmy}
          onChange={(e) => setTypedDmy(e.target.value)}
          onBlur={() => applyTypedDmy()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyTypedDmy()
            }
          }}
        />
      </label>

      {preview ? <p className="dob-input-preview">{preview}</p> : null}
    </div>
  )
}
