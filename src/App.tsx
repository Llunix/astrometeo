import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, CalendarDays, CloudRain, Crosshair, Droplets, Gauge, LocateFixed,
  MapPin, Moon, Plus, RefreshCw, Search, Sparkles, Thermometer, Trash2, Waves, Wind, X,
} from 'lucide-react'
import {
  AstroForecast, deepSkyScore, fetchForecast, HourWeather, hoursForNight,
  LocationResult, NightForecast, planetaryScore, scoreLabel, searchLocations,
} from './weather'

type SavedLocation = {
  id: string
  name: string
  detail?: string
  latitude: number
  longitude: number
  isGps?: boolean
}

const NAQUERA: SavedLocation = { id: 'naquera', name: 'Náquera', detail: 'Valencia, España', latitude: 39.658, longitude: -0.425 }
const STORAGE_KEY = 'astrometeo-locations-v1'

function readLocations(): SavedLocation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SavedLocation[]
    const valid = parsed.filter(item => item?.id && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && !item.isGps)
    return valid.length ? valid.slice(0, 4) : [NAQUERA]
  } catch { return [NAQUERA] }
}

function persistLocations(locations: SavedLocation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(locations.filter(item => !item.isGps).slice(0, 4)))
}

export default function App() {
  const initialLocations = useRef(readLocations())
  const [locations, setLocations] = useState<SavedLocation[]>(initialLocations.current)
  const [forecasts, setForecasts] = useState<Record<string, AstroForecast>>({})
  const [activeId, setActiveId] = useState(initialLocations.current[0].id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  const [selectedNight, setSelectedNight] = useState(0)
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [searching, setSearching] = useState(false)
  const requests = useRef(new Map<string, Promise<AstroForecast>>())

  const storeForecast = async (place: SavedLocation, makeActive = false) => {
    if (makeActive) setLoading(true)
    let request = requests.current.get(place.id)
    if (!request) {
      request = fetchForecast(place.latitude, place.longitude, [place.name, place.detail].filter(Boolean).join(' · '))
      requests.current.set(place.id, request)
    }
    try {
      const result = await request
      setForecasts(previous => ({ ...previous, [place.id]: result }))
      if (makeActive) {
        setActiveId(place.id)
        setSelectedNight(0)
        setSelected(0)
      }
    } catch (reason) {
      if (makeActive) setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la previsión')
    } finally {
      if (requests.current.get(place.id) === request) requests.current.delete(place.id)
      if (makeActive) setLoading(false)
    }
  }

  const preload = (items: SavedLocation[], exceptId?: string) => {
    items.filter(item => item.id !== exceptId).forEach(item => void storeForecast(item))
  }

  const loadInitial = () => {
    setError('')
    const fallback = initialLocations.current[0] || NAQUERA
    if (!navigator.geolocation) {
      setError('GPS no disponible. Mostrando tu primera ubicación guardada.')
      void storeForecast(fallback, true)
      preload(initialLocations.current, fallback.id)
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const gps: SavedLocation = {
          id: 'gps', name: 'Mi ubicación GPS', isGps: true,
          latitude: position.coords.latitude, longitude: position.coords.longitude,
        }
        setLocations(previous => [gps, ...previous.filter(item => item.id !== 'gps')].slice(0, 5))
        void storeForecast(gps, true)
        preload(initialLocations.current)
      },
      () => {
        setError(`GPS no disponible. Mostrando ${fallback.name}.`)
        void storeForecast(fallback, true)
        preload(initialLocations.current, fallback.id)
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 },
    )
  }

  useEffect(() => { loadInitial() }, [])

  useEffect(() => {
    if (locationQuery.trim().length < 2) { setLocationResults([]); return }
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try { setLocationResults(await searchLocations(locationQuery)) }
      catch { setLocationResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [locationQuery])

  const chooseLocation = (place: LocationResult) => {
    const saved: SavedLocation = {
      id: `place-${place.id}`, name: place.name, detail: place.detail,
      latitude: place.latitude, longitude: place.longitude,
    }
    setLocations(previous => {
      const next = [saved, ...previous.filter(item => item.id !== saved.id)].slice(0, 5)
      persistLocations(next)
      return next
    })
    setLocationOpen(false)
    setLocationQuery('')
    setLocationResults([])
    setError('')
    void storeForecast(saved, true)
  }

  const switchLocation = (place: SavedLocation) => {
    setLocationOpen(false)
    setError('')
    if (forecasts[place.id]) {
      setActiveId(place.id)
      setSelectedNight(0)
      setSelected(0)
    } else void storeForecast(place, true)
  }

  const removeLocation = (place: SavedLocation) => {
    if (place.isGps) return
    const next = locations.filter(item => item.id !== place.id)
    const safeNext = next.length ? next : [NAQUERA]
    setLocations(safeNext)
    persistLocations(safeNext)
    setForecasts(previous => {
      const copy = { ...previous }
      delete copy[place.id]
      return copy
    })
    if (activeId === place.id) switchLocation(safeNext[0])
  }

  const useGps = () => {
    setLocationOpen(false)
    setLoading(true)
    if (!navigator.geolocation) {
      setLoading(false)
      setError('Este dispositivo no ofrece ubicación GPS.')
      return
    }
    navigator.geolocation.getCurrentPosition(position => {
      const gps: SavedLocation = { id: 'gps', name: 'Mi ubicación GPS', isGps: true, latitude: position.coords.latitude, longitude: position.coords.longitude }
      setLocations(previous => [gps, ...previous.filter(item => item.id !== 'gps')].slice(0, 5))
      void storeForecast(gps, true)
    }, () => {
      setLoading(false)
      setError('No se ha podido acceder al GPS. Puedes buscar una ubicación manualmente.')
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 })
  }

  const forecast = forecasts[activeId]
  const activeNight = forecast?.nights[selectedNight]
  const tonight = useMemo(
    () => forecast && activeNight ? hoursForNight(forecast, activeNight).slice(0, 15) : [],
    [forecast, activeNight],
  )
  const dayProgression = useMemo(() => {
    if (!forecast || !activeNight) return []
    const sunset = new Date(activeNight.sunset)
    const start = new Date(sunset); start.setHours(12, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1); end.setHours(9, 0, 0, 0)
    return forecast.hours.filter(hour => hour.time >= start && hour.time <= end)
  }, [forecast, activeNight])
  const best = useMemo(() => bestHour(tonight, activeNight?.moonIllumination ?? 0), [tonight, activeNight])
  useEffect(() => setSelected(best.index), [best.index])

  if (loading && !forecast) return <Loading />
  if (!forecast || !activeNight || !tonight.length) return <Empty error={error} onRetry={loadInitial}/>

  const hour = tonight[selected] || tonight[0]
  const moonIllumination = activeNight.moonIllumination
  const deep = deepSkyScore(hour, moonIllumination)
  const planet = planetaryScore(hour)
  const overall = Math.max(deep, planet)
  const status = scoreLabel(overall)
  const mode = planet > deep ? 'Planetaria' : 'Cielo profundo'
  const activeLocation = locations.find(item => item.id === activeId)

  return <main>
    <header>
      <div className="brand"><div className="brand-mark"><Moon size={20}/></div><div><b>AstroMeteo</b><span>tu ventana para capturar</span></div></div>
      <button className="icon-button" onClick={() => activeLocation && void storeForecast(activeLocation, true)} aria-label="Actualizar previsión"><RefreshCw size={19}/></button>
    </header>

    <section className="location-row">
      <MapPin size={16}/><button className="location-button" onClick={() => setLocationOpen(true)}>{forecast.location}</button><small>{forecast.elevation} m</small>
    </section>
    <LocationTabs locations={locations} activeId={activeId} forecasts={forecasts} onChoose={switchLocation} onAdd={() => setLocationOpen(true)}/>
    {locationOpen && <LocationPicker
      query={locationQuery} setQuery={setLocationQuery} results={locationResults} searching={searching}
      saved={locations} activeId={activeId} onSaved={switchLocation} onRemove={removeLocation}
      onChoose={chooseLocation} onGps={useGps} onClose={() => setLocationOpen(false)}
    />}
    {error && <div className="notice">{error}</div>}

    <div className="section-title forecast-title"><span><CalendarDays size={15}/> Próximas noches</span><small>7 días</small></div>
    <section className="day-strip" aria-label="Previsión por noches">
      {forecast.nights.map((night, index) => <NightButton
        key={night.date} night={night} hours={hoursForNight(forecast, night)} active={selectedNight === index}
        onClick={() => setSelectedNight(index)}
      />)}
    </section>

    <section className={`verdict ${status.color}`}>
      <div className="eyebrow">{selectedNight === 0 ? 'ESTA NOCHE' : dayLabel(activeNight.date).toUpperCase()} · MEJOR MOMENTO {time(hour.time)}</div>
      <div className="verdict-main"><div><h1>{status.label}</h1><p>Mejor opción: <strong>{mode.toLowerCase()}</strong></p></div><ScoreRing value={overall}/></div>
      <div className="reason">{verdictText(hour, deep, planet, moonIllumination)}</div>
      <div className="mode-summary"><span><Crosshair size={14}/> Planetaria <b>{planet}</b></span><span><Sparkles size={14}/> Cielo profundo <b>{deep}</b></span></div>
    </section>

    <TrendChart hours={dayProgression} sunset={new Date(activeNight.sunset)} moon={moonIllumination}/>

    <div className="section-title"><span>Comparar horas</span><small>Pulsa una franja</small></div>
    <section className="hour-strip" aria-label="Comparación por horas">
      {tonight.map((item, index) => {
        const score = Math.max(deepSkyScore(item, moonIllumination), planetaryScore(item))
        return <button key={item.time.toISOString()} className={selected === index ? 'active' : ''} onClick={() => setSelected(index)}>
          <b>{time(item.time)}</b><WeatherGlyph cloud={item.cloud} rain={item.precipitationProbability}/><span className={`dot ${scoreLabel(score).color}`}/><small>{item.cloud}%</small>
        </button>
      })}
    </section>

    <section className="mode-grid">
      <ModeCard icon={<Crosshair/>} title="Planetaria" score={planet} detail={seeingText(hour)} />
      <ModeCard icon={<Sparkles/>} title="Cielo profundo" score={deep} detail={`${hour.cloud}% nubes · Luna ${moonIllumination}%`} />
    </section>

    <ComparisonBoard
      locations={locations} forecasts={forecasts} activeId={activeId}
      onChoose={(place, nightIndex) => { switchLocation(place); setSelectedNight(nightIndex) }}
      onAdd={() => setLocationOpen(true)}
    />

    <div className="section-title"><span>Condiciones a las {time(hour.time)}</span></div>
    <section className="metrics">
      <Metric icon={<CloudRain/>} label="Nubosidad" value={`${hour.cloud}%`} sub={`Baja ${hour.cloudLow}% · Media ${hour.cloudMid}% · Alta ${hour.cloudHigh}%`} level={100 - hour.cloud}/>
      <Metric icon={<Droplets/>} label="Humedad" value={`${hour.humidity}%`} sub={`Rocío ${hour.dewPoint}° · margen ${(hour.temperature - hour.dewPoint).toFixed(1)}°`} level={100 - hour.humidity}/>
      <Metric icon={<Waves/>} label="Seeing" value={hour.seeing ? `${hour.seeing}/8` : 'Estimado'} sub={seeingText(hour)} level={hour.seeing ? hour.seeing / 8 * 100 : Math.max(0, 100 - hour.jetStream)}/>
      <Metric icon={<Wind/>} label="Jet stream" value={`${Math.round(hour.jetStream)} km/h`} sub={hour.jetStream < 50 ? 'Favorable' : hour.jetStream < 85 ? 'Moderado' : 'Desfavorable'} level={Math.max(0, 100 - hour.jetStream)}/>
      <Metric icon={<Thermometer/>} label="Temperatura" value={`${hour.temperature}°`} sub={`Viento ${hour.wind} · rachas ${hour.gust} km/h`} level={50}/>
      <Metric icon={<CloudRain/>} label="Precipitación" value={`${hour.precipitationProbability}%`} sub={`${hour.precipitation} mm previstos`} level={100 - hour.precipitationProbability}/>
      <Metric icon={<Moon/>} label="Luna" value={`${moonIllumination}%`} sub={activeNight.moonPhaseName} level={100 - moonIllumination}/>
      <Metric icon={<Gauge/>} label="Visibilidad" value={`${Math.round(hour.visibility)} km`} sub="Visibilidad meteorológica" level={Math.min(100, hour.visibility * 2)}/>
    </section>
    <footer>
      Meteorología y jet stream: Open-Meteo · Seeing: 7Timer<br/>
      El seeing y los índices son estimaciones orientativas, no mediciones locales.
    </footer>
  </main>
}

function bestHour(hours: HourWeather[], moon: number) {
  return hours.reduce((winner, hour, index) => {
    const score = Math.max(deepSkyScore(hour, moon), planetaryScore(hour))
    return score > winner.score ? { index, score, hour } : winner
  }, { index: 0, score: -1, hour: hours[0] } as { index: number, score: number, hour?: HourWeather })
}

function nightScores(forecast: AstroForecast, night: NightForecast) {
  const hours = hoursForNight(forecast, night)
  const deep = hours.reduce((best, hour) => Math.max(best, deepSkyScore(hour, night.moonIllumination)), 0)
  const planet = hours.reduce((best, hour) => Math.max(best, planetaryScore(hour)), 0)
  const winner = bestHour(hours, night.moonIllumination)
  return { deep, planet, overall: Math.max(deep, planet), time: winner.hour ? time(winner.hour.time) : '—' }
}

function time(date: Date) { return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }
function dayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`)
  return value.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '')
}

function LocationTabs({ locations, activeId, forecasts, onChoose, onAdd }: {
  locations: SavedLocation[], activeId: string, forecasts: Record<string, AstroForecast>,
  onChoose: (place: SavedLocation) => void, onAdd: () => void,
}) {
  return <div className="location-tabs" aria-label="Ubicaciones">
    {locations.map(place => <button key={place.id} className={activeId === place.id ? 'active' : ''} onClick={() => onChoose(place)}>
      {place.isGps && <LocateFixed size={13}/>}<span>{place.name}</span>{!forecasts[place.id] && <i/>}
    </button>)}
    <button className="add-location" onClick={onAdd}><Plus size={14}/> Añadir</button>
  </div>
}

function LocationPicker({ query, setQuery, results, searching, saved, activeId, onSaved, onRemove, onChoose, onGps, onClose }: {
  query: string, setQuery: (value: string) => void, results: LocationResult[], searching: boolean,
  saved: SavedLocation[], activeId: string, onSaved: (place: SavedLocation) => void,
  onRemove: (place: SavedLocation) => void, onChoose: (place: LocationResult) => void,
  onGps: () => void, onClose: () => void,
}) {
  return <div className="location-panel">
    <div className="location-panel-head"><b>Ubicaciones</b><button onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
    <button className="gps-button" onClick={onGps}><LocateFixed size={17}/> Usar mi ubicación GPS</button>
    <label className="search-box"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ciudad o código postal"/></label>
    {!query && <div className="saved-list">
      {saved.map(place => <div key={place.id} className={activeId === place.id ? 'active' : ''}>
        <button onClick={() => onSaved(place)}><MapPin size={15}/><span><b>{place.name}</b><small>{place.detail || (place.isGps ? 'Coordenadas actuales' : '')}</small></span></button>
        {!place.isGps && <button className="remove-place" onClick={() => onRemove(place)} aria-label={`Eliminar ${place.name}`}><Trash2 size={15}/></button>}
      </div>)}
    </div>}
    <div className="location-results">
      {searching && <small>Buscando…</small>}
      {!searching && query.length >= 2 && !results.length && <small>No hay resultados</small>}
      {results.map(place => <button key={place.id} onClick={() => onChoose(place)}><MapPin size={16}/><span><b>{place.name}</b><small>{place.detail}</small></span><Plus size={15}/></button>)}
    </div>
  </div>
}

function NightButton({ night, hours, active, onClick }: { night: NightForecast, hours: HourWeather[], active: boolean, onClick: () => void }) {
  const deep = hours.reduce((value, hour) => Math.max(value, deepSkyScore(hour, night.moonIllumination)), 0)
  const planet = hours.reduce((value, hour) => Math.max(value, planetaryScore(hour)), 0)
  const averageCloud = hours.length ? Math.round(hours.reduce((sum, hour) => sum + hour.cloud, 0) / hours.length) : 100
  const low = hours.length ? Math.round(hours.reduce((sum, hour) => sum + hour.cloudLow, 0) / hours.length) : 100
  const mid = hours.length ? Math.round(hours.reduce((sum, hour) => sum + hour.cloudMid, 0) / hours.length) : 100
  const high = hours.length ? Math.round(hours.reduce((sum, hour) => sum + hour.cloudHigh, 0) / hours.length) : 100
  const rain = hours.length ? Math.max(...hours.map(hour => hour.precipitationProbability)) : 0
  return <button className={active ? 'active' : ''} onClick={onClick}>
    <span>{dayLabel(night.date)}</span><WeatherGlyph cloud={averageCloud} rain={rain}/><b>{Math.max(deep, planet)}</b>
    <small className="night-modes"><i>P {planet}</i><i>CP {deep}</i></small>
    <small className="cloud-layers"><i>B {low}</i><i>M {mid}</i><i>A {high}</i></small>
  </button>
}

function WeatherGlyph({ cloud, rain }: { cloud: number, rain: number }) {
  return <span className="weather-glyph">{rain > 35 ? '🌧️' : cloud > 65 ? '☁️' : cloud > 25 ? '🌤️' : '✨'}</span>
}

function TrendChart({ hours, sunset, moon }: { hours: HourWeather[], sunset: Date, moon: number }) {
  const [view, setView] = useState<'clouds'|'conditions'|'quality'>('clouds')
  if (hours.length < 2) return null
  const width = 680, height = 178, left = 28, right = 10, top = 16, bottom = 30
  const chartW = width - left - right, chartH = height - top - bottom
  const x = (index: number) => left + index / (hours.length - 1) * chartW
  const y = (value: number) => top + (100 - Math.max(0, Math.min(100, value))) / 100 * chartH
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')
  const sunsetIndex = Math.max(0, hours.findIndex(hour => hour.time >= sunset))
  return <section className="trend-card">
    <div className="trend-heading"><div><span>EVOLUCIÓN HORARIA</span><h2>De esta tarde al amanecer</h2></div><small>0–100</small></div>
    <div className="chart-tabs">
      <button className={view === 'clouds' ? 'active' : ''} onClick={() => setView('clouds')}>Capas de nubes</button>
      <button className={view === 'conditions' ? 'active' : ''} onClick={() => setView('conditions')}>Humedad y lluvia</button>
      <button className={view === 'quality' ? 'active' : ''} onClick={() => setView('quality')}>Calidad astro</button>
    </div>
    {view === 'clouds' && <div className="trend-legend"><i className="low-line"/>Bajas <i className="mid-line"/>Medias <i className="high-line"/>Altas</div>}
    {view === 'conditions' && <div className="trend-legend"><i className="cloud-line"/>Nubosidad <i className="humidity-line"/>Humedad <i className="rain-line"/>Lluvia</div>}
    {view === 'quality' && <div className="trend-legend"><i className="planet-line"/>Planetaria <i className="deep-line"/>Cielo profundo</div>}
    <div className="chart-scroll">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución horaria de las condiciones astronómicas">
        <rect x={x(sunsetIndex)} y={top} width={width - right - x(sunsetIndex)} height={chartH} rx="7" className="night-zone"/>
        {[0, 25, 50, 75, 100].map(value => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/><text x={left - 6} y={y(value) + 3} textAnchor="end" className="axis-label">{value}</text></g>)}
        <line x1={x(sunsetIndex)} x2={x(sunsetIndex)} y1={top} y2={top + chartH} className="sunset-line"/>
        <text x={Math.min(width - 64, x(sunsetIndex) + 5)} y={top + 11} className="sunset-label">☾ anochecer</text>
        {view === 'clouds' && <><path d={path(hours.map(hour => hour.cloudLow))} className="series-low"/><path d={path(hours.map(hour => hour.cloudMid))} className="series-mid"/><path d={path(hours.map(hour => hour.cloudHigh))} className="series-high"/></>}
        {view === 'conditions' && <><path d={path(hours.map(hour => hour.cloud))} className="series-cloud"/><path d={path(hours.map(hour => hour.humidity))} className="series-humidity"/><path d={path(hours.map(hour => hour.precipitationProbability))} className="series-rain"/></>}
        {view === 'quality' && <><path d={path(hours.map(hour => planetaryScore(hour)))} className="series-planet"/><path d={path(hours.map(hour => deepSkyScore(hour, moon)))} className="series-deep"/></>}
        {hours.map((hour, index) => index % 3 === 0 || index === hours.length - 1 ? <text key={hour.time.toISOString()} x={x(index)} y={height - 8} textAnchor="middle" className="time-label">{time(hour.time)}</text> : null)}
      </svg>
    </div>
  </section>
}

function ComparisonBoard({ locations, forecasts, activeId, onChoose, onAdd }: {
  locations: SavedLocation[], forecasts: Record<string, AstroForecast>, activeId: string,
  onChoose: (place: SavedLocation, nightIndex: number) => void, onAdd: () => void,
}) {
  const visible = locations.filter(place => forecasts[place.id]).slice(0, 4)
  return <section className="compare-card">
    <div className="compare-heading"><div><span><BarChart3 size={15}/> COMPARAR UBICACIONES</span><h2>¿Dónde y qué noche?</h2></div><button onClick={onAdd}><Plus size={15}/> Añadir</button></div>
    {visible.length < 2 && <div className="compare-empty"><MapPin size={22}/><p>Añade otra ubicación para comparar sus tres próximas noches con {visible[0]?.name || 'la actual'}.</p><button onClick={onAdd}>Buscar ubicación</button></div>}
    {visible.length >= 2 && <div className="compare-scroll"><div className="compare-table">
      <div className="compare-row compare-labels"><span>Ubicación</span>{[0, 1, 2].map(index => <span key={index}>{index === 0 ? 'Esta noche' : `Noche +${index}`}</span>)}</div>
      {visible.map(place => {
        const forecast = forecasts[place.id]
        return <div className={`compare-row ${activeId === place.id ? 'active' : ''}`} key={place.id}>
          <button className="compare-place" onClick={() => onChoose(place, 0)}><b>{place.name}</b><small>{place.isGps ? 'GPS' : place.detail}</small></button>
          {[0, 1, 2].map(index => {
            const night = forecast.nights[index]
            if (!night) return <span key={index}>—</span>
            const scores = nightScores(forecast, night)
            const label = scoreLabel(scores.overall)
            return <button key={index} className={`compare-night ${label.color}`} onClick={() => onChoose(place, index)}>
              <small>{index === 0 ? 'Esta noche' : dayLabel(night.date)}</small><b>{scores.overall}</b><span>{scores.time}</span><i>P {scores.planet} · CP {scores.deep}</i>
            </button>
          })}
        </div>
      })}
    </div></div>}
  </section>
}

function ScoreRing({ value }: { value: number }) {
  return <div className="score-ring" style={{ '--score': `${value * 3.6}deg` } as React.CSSProperties}><div><b>{value}</b><small>/100</small></div></div>
}
function ModeCard({ icon, title, score, detail }: { icon: React.ReactNode, title: string, score: number, detail: string }) {
  const status = scoreLabel(score)
  return <article className="mode-card"><div className="mode-head"><span>{icon}</span><small className={status.color}>{status.label}</small></div><h3>{title}</h3><div className="mode-score"><b>{score}</b><span>/100</span></div><p>{detail}</p></article>
}
function Metric({ icon, label, value, sub, level }: { icon: React.ReactNode, label: string, value: string, sub: string, level: number }) {
  return <article className="metric"><div className="metric-icon">{icon}</div><div className="metric-copy"><span>{label}</span><b>{value}</b><small>{sub}</small><div className="bar"><i style={{ width: `${Math.max(4, Math.min(100, level))}%` }}/></div></div></article>
}
function seeingText(hour: HourWeather) {
  if (hour.seeing) return hour.seeing >= 7 ? 'Muy estable' : hour.seeing >= 5 ? 'Estabilidad media' : hour.seeing >= 3 ? 'Inestable' : 'Muy inestable'
  return hour.jetStream < 45 ? 'Estimación favorable por jet stream' : hour.jetStream < 80 ? 'Estimación de estabilidad media' : 'Estimación desfavorable por jet stream'
}
function verdictText(hour: HourWeather, deep: number, planet: number, moon: number) {
  if (hour.precipitationProbability > 45) return 'El riesgo de precipitación es demasiado alto para montar el equipo.'
  if (hour.cloud > 65) return 'Las nubes serán el principal obstáculo durante esta franja.'
  if (hour.humidity > 88 || hour.temperature - hour.dewPoint < 2) return 'Atención a la condensación: prepara las cintas calefactoras.'
  if (planet > deep) return `Nubosidad contenida y estabilidad ${hour.jetStream < 50 ? 'favorable' : 'aceptable'} para planetaria.`
  if (moon > 70) return 'La Luna limita el cielo profundo de banda ancha; mejor objetos brillantes o banda estrecha.'
  return 'Cielo suficientemente despejado y oscuro para una sesión de cielo profundo.'
}
function Loading() { return <div className="center"><div className="loader"/><h2>Mirando el cielo…</h2><p>Calculando las mejores horas desde tu ubicación</p></div> }
function Empty({ error, onRetry }: { error: string, onRetry: () => void }) { return <div className="center"><Moon size={42}/><h2>No pudimos leer el cielo</h2><p>{error || 'No hay horas nocturnas disponibles.'}</p><button className="retry" onClick={onRetry}>Reintentar</button></div> }
