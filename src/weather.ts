export type HourWeather = {
  time: Date
  temperature: number
  humidity: number
  dewPoint: number
  precipitation: number
  precipitationProbability: number
  cloud: number
  cloudLow: number
  cloudMid: number
  cloudHigh: number
  wind: number
  gust: number
  jetStream: number
  visibility: number
  seeing?: number
}

export type AstroForecast = {
  location: string
  latitude: number
  longitude: number
  elevation: number
  moonIllumination: number
  moonPhaseName: string
  moonrise?: string
  moonset?: string
  sunset: string
  sunrise: string
  hours: HourWeather[]
  nights: NightForecast[]
}

export type NightForecast = {
  date: string
  sunrise: string
  sunset: string
  moonIllumination: number
  moonPhaseName: string
}

export type LocationResult = {
  id: number
  name: string
  detail: string
  latitude: number
  longitude: number
}

const phaseName = (phase: number) => {
  if (phase < .03 || phase > .97) return 'Luna nueva'
  if (phase < .22) return 'Creciente'
  if (phase < .28) return 'Cuarto creciente'
  if (phase < .47) return 'Gibosa creciente'
  if (phase < .53) return 'Luna llena'
  if (phase < .72) return 'Gibosa menguante'
  if (phase < .78) return 'Cuarto menguante'
  return 'Menguante'
}

export async function searchLocations(query: string): Promise<LocationResult[]> {
  const value = query.trim()
  if (value.length < 2) return []
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.search = new URLSearchParams({ name: value, count: '6', language: 'es', format: 'json' }).toString()
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo buscar la ubicación')
  const data = await response.json()
  return (data.results ?? []).map((place: any) => ({
    id: place.id,
    name: place.name,
    detail: [place.admin1, place.country].filter(Boolean).join(', '),
    latitude: place.latitude,
    longitude: place.longitude,
  }))
}

export async function fetchForecast(latitude: number, longitude: number, locationName?: string): Promise<AstroForecast> {
  const hourly = [
    'temperature_2m','relative_humidity_2m','dew_point_2m','precipitation','precipitation_probability',
    'cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','wind_speed_10m','wind_gusts_10m',
    'wind_speed_250hPa','visibility'
  ].join(',')
  const daily = ['sunrise','sunset','moonrise','moonset','moon_phase'].join(',')
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), hourly, daily,
    timezone: 'auto', forecast_days: '8', wind_speed_unit: 'kmh'
  }).toString()

  const [weatherResponse, seeing] = await Promise.all([
    fetch(url),
    fetchSeeing(latitude, longitude),
  ])
  if (!weatherResponse.ok) throw new Error('No se pudo obtener la previsión meteorológica')
  const data = await weatherResponse.json()
  const h = data.hourly
  const hours: HourWeather[] = h.time.map((time: string, i: number) => ({
    time: new Date(time), temperature: h.temperature_2m[i], humidity: h.relative_humidity_2m[i],
    dewPoint: h.dew_point_2m[i], precipitation: h.precipitation[i],
    precipitationProbability: h.precipitation_probability[i], cloud: h.cloud_cover[i],
    cloudLow: h.cloud_cover_low[i], cloudMid: h.cloud_cover_mid[i], cloudHigh: h.cloud_cover_high[i],
    wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i], jetStream: h.wind_speed_250hPa[i],
    visibility: h.visibility[i] / 1000,
    seeing: nearestSeeing(new Date(time), seeing),
  }))
  const phase = Number(data.daily.moon_phase?.[0] ?? 0)
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100)
  const nights: NightForecast[] = data.daily.time.slice(0, 7).map((date: string, i: number) => {
    const nightPhase = Number(data.daily.moon_phase?.[i] ?? 0)
    return {
      date,
      sunset: data.daily.sunset[i],
      sunrise: data.daily.sunrise[i + 1] ?? data.daily.sunrise[i],
      moonIllumination: Math.round((1 - Math.cos(2 * Math.PI * nightPhase)) / 2 * 100),
      moonPhaseName: phaseName(nightPhase),
    }
  })
  return {
    location: locationName || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    latitude, longitude, elevation: data.elevation, moonIllumination: illumination,
    moonPhaseName: phaseName(phase), moonrise: data.daily.moonrise?.[0], moonset: data.daily.moonset?.[0],
    sunset: data.daily.sunset[0], sunrise: data.daily.sunrise[1] ?? data.daily.sunrise[0], hours, nights,
  }
}

type SeeingPoint = { date: Date, value: number }
async function fetchSeeing(lat: number, lon: number): Promise<SeeingPoint[]> {
  try {
    const r = await fetch(`https://www.7timer.info/bin/api.pl?lon=${lon}&lat=${lat}&product=astro&output=json`)
    if (!r.ok) return []
    const d = await r.json()
    const init = String(d.init)
    const base = new Date(`${init.slice(0,4)}-${init.slice(4,6)}-${init.slice(6,8)}T${init.slice(8,10)}:00:00Z`)
    return d.dataseries.map((x: {timepoint:number, seeing:number}) => ({
      date: new Date(base.getTime() + x.timepoint * 3600000), value: x.seeing,
    }))
  } catch { return [] }
}

function nearestSeeing(date: Date, points: SeeingPoint[]) {
  if (!points.length) return undefined
  const best = points.reduce((a, b) => Math.abs(b.date.getTime()-date.getTime()) < Math.abs(a.date.getTime()-date.getTime()) ? b : a)
  return Math.abs(best.date.getTime() - date.getTime()) <= 4 * 3600000 ? best.value : undefined
}

export function isNightHour(hour: HourWeather, forecast: AstroForecast) {
  const sunset = new Date(forecast.sunset)
  const sunrise = new Date(forecast.sunrise)
  const nextSunrise = new Date(sunrise)
  if (sunrise <= sunset) nextSunrise.setDate(nextSunrise.getDate() + 1)
  return hour.time >= sunset && hour.time <= nextSunrise
}

export function hoursForNight(forecast: AstroForecast, night: NightForecast) {
  const sunset = new Date(night.sunset)
  const sunrise = new Date(night.sunrise)
  return forecast.hours.filter(hour => hour.time >= sunset && hour.time <= sunrise)
}

export function deepSkyScore(h: HourWeather, moon: number) {
  const cloud = 100-h.cloud, rain = 100-h.precipitationProbability
  const humidity = Math.max(0, 100-Math.max(0,h.humidity-65)*2.1)
  const wind = Math.max(0, 100-Math.max(0,h.wind-8)*5)
  const darkness = 100-moon*.65
  return Math.round(cloud*.38 + rain*.2 + humidity*.14 + wind*.12 + darkness*.16)
}

export function planetaryScore(h: HourWeather) {
  const cloud = 100-h.cloud, rain = 100-h.precipitationProbability
  const jet = Math.max(0, 100-Math.max(0,h.jetStream-35)*1.35)
  const seeing = h.seeing ? (h.seeing-1)/7*100 : jet
  const wind = Math.max(0, 100-Math.max(0,h.wind-10)*5)
  return Math.round(cloud*.3 + rain*.15 + seeing*.25 + jet*.2 + wind*.1)
}

export function scoreLabel(score: number) {
  if (score >= 78) return { label:'Muy buena', color:'good' }
  if (score >= 60) return { label:'Aceptable', color:'fair' }
  if (score >= 42) return { label:'Complicada', color:'poor' }
  return { label:'No recomendable', color:'bad' }
}
