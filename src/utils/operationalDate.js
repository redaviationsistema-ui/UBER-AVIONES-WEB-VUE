export const DEFAULT_OPERATIONAL_TIME_ZONE = 'America/Mexico_City'

export function getOperationalDate(date = new Date(), timeZone = DEFAULT_OPERATIONAL_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addOperationalDays(date, days = 0, timeZone = DEFAULT_OPERATIONAL_TIME_ZONE) {
  const [year, month, day] = getOperationalDate(date, timeZone).split('-').map(Number)
  return getOperationalDate(new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12)), timeZone)
}

export function compareOperationalDates(left = '', right = '') {
  return String(left).localeCompare(String(right))
}
