import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CloudRain, Crosshair, Droplets, Gauge, LocateFixed, MapPin, Moon, RefreshCw, Search, Sparkles, Thermometer, Waves, Wind, X } from 'lucide-react'
import { AstroForecast, deepSkyScore, fetchForecast, HourWeather, hoursForNight, LocationResult, NightForecast, planetaryScore, scoreLabel, searchLocations } from './weather'

const demoCoords = { latitude: 39.658, longitude: -0.425 }

export default function App() {
  const [forecast, setForecast] = useState<AstroForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  const [selectedNight, setSelectedNight] = useState(0)
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [searching, setSearching] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    if (!navigator.geolocation) return getWeather(demoCoords.latitude, demoCoords.longitude, 'Náquera', true)
    navigator.geolocation.getCurrentPosition(
      p => getWeather(p.coords.latitude, p.coords.longitude, 'Mi ubicación'),
      () => getWeather(demoCoords.latitude, demoCoords.longitude, 'Náquera', true),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 }
    )
  }
  const getWeather = async (lat:number, lon:number, name?:string, fallback=false) => {
    try {
      const result = await fetchForecast(lat,lon,name); setForecast(result); setSelectedNight(0); setSelected(0)
      if (fallback) setError('GPS no disponible. Mostrando Náquera como ubicación provisional.')
    } catch(e) { setError(e instanceof Error ? e.message : 'Error inesperado') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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
    setLocationOpen(false); setLocationQuery(''); setLocationResults([]); setLoading(true); setError('')
    getWeather(place.latitude, place.longitude, `${place.name}${place.detail ? ` · ${place.detail}` : ''}`)
  }

  const activeNight = forecast?.nights[selectedNight]
  const tonight = useMemo(() => forecast && activeNight ? hoursForNight(forecast, activeNight).slice(0, 15) : [], [forecast, activeNight])
  const dayProgression = useMemo(() => {
    if (!forecast || !activeNight) return []
    const sunset = new Date(activeNight.sunset)
    const start = new Date(sunset)
    start.setHours(12, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    end.setHours(9, 0, 0, 0)
    return forecast.hours.filter(h => h.time >= start && h.time <= end)
  }, [forecast, activeNight])
  const best = useMemo(() => tonight.reduce((winner, h, i) => {
    const total = Math.max(deepSkyScore(h, activeNight?.moonIllumination ?? 0), planetaryScore(h))
    return total > winner.score ? {index:i, score:total} : winner
  }, {index:0,score:-1}), [tonight,activeNight])
  useEffect(() => setSelected(best.index), [best.index])

  if (loading) return <Loading />
  if (!forecast || !tonight.length) return <Empty error={error} onRetry={load}/>
  const hour = tonight[selected] || tonight[0]
  const moonIllumination = activeNight?.moonIllumination ?? forecast.moonIllumination
  const moonPhaseName = activeNight?.moonPhaseName ?? forecast.moonPhaseName
  const deep = deepSkyScore(hour, moonIllumination)
  const planet = planetaryScore(hour)
  const overall = Math.max(deep, planet)
  const status = scoreLabel(overall)
  const mode = planet > deep ? 'Planetaria' : 'Cielo profundo'

  return <main>
    <header>
      <div className="brand"><div className="brand-mark"><Moon size={20}/></div><div><b>AstroMeteo</b><span>para astrofotografía</span></div></div>
      <button className="icon-button" onClick={()=>getWeather(forecast.latitude,forecast.longitude,forecast.location)} aria-label="Actualizar"><RefreshCw size={19}/></button>
    </header>

    <section className="location-row">
      <MapPin size={16}/><button className="location-button" onClick={()=>setLocationOpen(true)}>{forecast.location}</button><small>{forecast.elevation} m</small>
    </section>
    {locationOpen && <LocationPicker query={locationQuery} setQuery={setLocationQuery} results={locationResults} searching={searching} onChoose={chooseLocation} onGps={()=>{setLocationOpen(false);load()}} onClose={()=>setLocationOpen(false)}/>} 
    {error && <div className="notice">{error}</div>}

    <div className="section-title forecast-title"><span><CalendarDays size={15}/> Próximas noches</span><small>Previsión de 7 días</small></div>
    <section className="day-strip">
      {forecast.nights.map((night,i)=><NightButton key={night.date} night={night} hours={hoursForNight(forecast,night)} active={selectedNight===i} onClick={()=>setSelectedNight(i)}/>) }
    </section>

    <section className={`verdict ${status.color}`}>
      <div className="eyebrow">{selectedNight===0?'ESTA NOCHE':dayLabel(activeNight!.date).toUpperCase()} · MEJOR MOMENTO {time(hour.time)}</div>
      <div className="verdict-main"><div><h1>{status.label}</h1><p>La mejor opción es <strong>{mode.toLowerCase()}</strong></p></div><ScoreRing value={overall}/></div>
      <div className="reason">{verdictText(hour, deep, planet, moonIllumination)}</div>
    </section>

    <TrendChart hours={dayProgression} sunset={new Date(activeNight!.sunset)} />

    <div className="section-title"><span>Pronóstico por horas</span><small>Desliza para ver la noche</small></div>
    <section className="hour-strip">
      {tonight.map((h,i) => {
        const score = Math.max(deepSkyScore(h,moonIllumination),planetaryScore(h))
        return <button key={h.time.toISOString()} className={selected===i?'active':''} onClick={()=>setSelected(i)}>
          <b>{time(h.time)}</b><WeatherGlyph cloud={h.cloud} rain={h.precipitationProbability}/><span className={`dot ${scoreLabel(score).color}`}/><small>{h.cloud}%</small>
        </button>
      })}
    </section>

    <section className="mode-grid">
      <ModeCard icon={<Crosshair/>} title="Planetaria" score={planet} detail={seeingText(hour)} />
      <ModeCard icon={<Sparkles/>} title="Cielo profundo" score={deep} detail={`${hour.cloud}% nubes · Luna ${moonIllumination}%`} />
    </section>

    <div className="section-title"><span>Condiciones a las {time(hour.time)}</span></div>
    <section className="metrics">
      <Metric icon={<CloudRain/>} label="Nubosidad" value={`${hour.cloud}%`} sub={`Baja ${hour.cloudLow}% · Media ${hour.cloudMid}% · Alta ${hour.cloudHigh}%`} level={100-hour.cloud}/>
      <Metric icon={<Droplets/>} label="Humedad" value={`${hour.humidity}%`} sub={`Rocío ${hour.dewPoint}° · margen ${(hour.temperature-hour.dewPoint).toFixed(1)}°`} level={100-hour.humidity}/>
      <Metric icon={<Waves/>} label="Seeing" value={hour.seeing ? `${hour.seeing}/8` : 'Estimado'} sub={seeingText(hour)} level={hour.seeing ? hour.seeing/8*100 : Math.max(0,100-hour.jetStream)}/>
      <Metric icon={<Wind/>} label="Jet stream" value={`${Math.round(hour.jetStream)} km/h`} sub={hour.jetStream < 50 ? 'Favorable' : hour.jetStream < 85 ? 'Moderado' : 'Desfavorable'} level={Math.max(0,100-hour.jetStream)}/>
      <Metric icon={<Thermometer/>} label="Temperatura" value={`${hour.temperature}°`} sub={`Viento ${hour.wind} · rachas ${hour.gust} km/h`} level={50}/>
      <Metric icon={<CloudRain/>} label="Precipitación" value={`${hour.precipitationProbability}%`} sub={`${hour.precipitation} mm previstos`} level={100-hour.precipitationProbability}/>
      <Metric icon={<Moon/>} label="Luna" value={`${moonIllumination}%`} sub={moonPhaseName} level={100-moonIllumination}/>
      <Metric icon={<Gauge/>} label="Visibilidad" value={`${Math.round(hour.visibility)} km`} sub="Visibilidad meteorológica" level={Math.min(100,hour.visibility*2)}/>
    </section>
    <footer>Datos meteorológicos: Open-Meteo · Seeing: 7Timer<br/>Las previsiones son orientativas y pueden variar localmente.</footer>
  </main>
}

function time(d:Date){ return d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) }
function dayLabel(date:string){
  const value = new Date(`${date}T12:00:00`)
  return value.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'}).replace('.','')
}
function LocationPicker({query,setQuery,results,searching,onChoose,onGps,onClose}:{query:string,setQuery:(value:string)=>void,results:LocationResult[],searching:boolean,onChoose:(place:LocationResult)=>void,onGps:()=>void,onClose:()=>void}) {
  return <div className="location-panel">
    <div className="location-panel-head"><b>Cambiar ubicación</b><button onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
    <button className="gps-button" onClick={onGps}><LocateFixed size={17}/> Usar mi ubicación GPS</button>
    <label className="search-box"><Search size={17}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ciudad o código postal"/></label>
    <div className="location-results">
      {searching && <small>Buscando…</small>}
      {!searching && query.length>=2 && !results.length && <small>No hay resultados</small>}
      {results.map(place=><button key={place.id} onClick={()=>onChoose(place)}><MapPin size={16}/><span><b>{place.name}</b><small>{place.detail}</small></span></button>)}
    </div>
  </div>
}
function NightButton({night,hours,active,onClick}:{night:NightForecast,hours:HourWeather[],active:boolean,onClick:()=>void}) {
  const best = hours.reduce((value,h)=>Math.max(value,deepSkyScore(h,night.moonIllumination),planetaryScore(h)),0)
  const averageCloud = hours.length ? Math.round(hours.reduce((sum,h)=>sum+h.cloud,0)/hours.length) : 100
  const rain = hours.length ? Math.max(...hours.map(h=>h.precipitationProbability)) : 0
  return <button className={active?'active':''} onClick={onClick}>
    <span>{dayLabel(night.date)}</span><WeatherGlyph cloud={averageCloud} rain={rain}/><b>{best}</b><small>{averageCloud}% nubes</small>
  </button>
}
function WeatherGlyph({cloud,rain}:{cloud:number,rain:number}) { return <span className="weather-glyph">{rain>35?'🌧️':cloud>65?'☁️':cloud>25?'🌤️':'✨'}</span> }
function TrendChart({hours,sunset}:{hours:HourWeather[],sunset:Date}) {
  if(hours.length < 2) return null
  const width=680, height=170, left=28, right=10, top=16, bottom=28
  const chartW=width-left-right, chartH=height-top-bottom
  const x=(i:number)=>left+i/(hours.length-1)*chartW
  const y=(v:number)=>top+(100-Math.max(0,Math.min(100,v)))/100*chartH
  const path=(values:number[])=>values.map((v,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const sunsetIndex=Math.max(0,hours.findIndex(h=>h.time>=sunset))
  return <section className="trend-card">
    <div className="trend-heading"><div><span>EVOLUCIÓN DEL CIELO</span><h2>De esta tarde al amanecer</h2></div><small>0–100%</small></div>
    <div className="trend-legend"><i className="cloud-line"/>Nubes <i className="humidity-line"/>Humedad <i className="rain-line"/>Lluvia</div>
    <div className="chart-scroll">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución horaria de nubosidad, humedad y precipitación">
        <rect x={x(sunsetIndex)} y={top} width={width-right-x(sunsetIndex)} height={chartH} rx="7" className="night-zone"/>
        {[0,25,50,75,100].map(v=><g key={v}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} className="grid-line"/><text x={left-6} y={y(v)+3} textAnchor="end" className="axis-label">{v}</text></g>)}
        <line x1={x(sunsetIndex)} x2={x(sunsetIndex)} y1={top} y2={top+chartH} className="sunset-line"/>
        <text x={Math.min(width-64,x(sunsetIndex)+5)} y={top+11} className="sunset-label">☾ anochecer</text>
        <path d={path(hours.map(h=>h.cloud))} className="series-cloud"/>
        <path d={path(hours.map(h=>h.humidity))} className="series-humidity"/>
        <path d={path(hours.map(h=>h.precipitationProbability))} className="series-rain"/>
        {hours.map((h,i)=>i%3===0||i===hours.length-1?<text key={h.time.toISOString()} x={x(i)} y={height-8} textAnchor="middle" className="time-label">{time(h.time)}</text>:null)}
      </svg>
    </div>
  </section>
}
function ScoreRing({value}:{value:number}) { return <div className="score-ring" style={{'--score':`${value*3.6}deg`} as React.CSSProperties}><div><b>{value}</b><small>/100</small></div></div> }
function ModeCard({icon,title,score,detail}:{icon:React.ReactNode,title:string,score:number,detail:string}) { const s=scoreLabel(score); return <article className="mode-card"><div className="mode-head"><span>{icon}</span><small className={s.color}>{s.label}</small></div><h3>{title}</h3><div className="mode-score"><b>{score}</b><span>/100</span></div><p>{detail}</p></article> }
function Metric({icon,label,value,sub,level}:{icon:React.ReactNode,label:string,value:string,sub:string,level:number}) { return <article className="metric"><div className="metric-icon">{icon}</div><div className="metric-copy"><span>{label}</span><b>{value}</b><small>{sub}</small><div className="bar"><i style={{width:`${Math.max(4,Math.min(100,level))}%`}}/></div></div></article> }
function seeingText(h:HourWeather){
  if(h.seeing) return h.seeing>=7?'Muy estable':h.seeing>=5?'Estabilidad media':h.seeing>=3?'Inestable':'Muy inestable'
  return h.jetStream<45?'Atmósfera probablemente estable':h.jetStream<80?'Estabilidad media':'Atmósfera probablemente inestable'
}
function verdictText(h:HourWeather,deep:number,planet:number,moon:number){
  if(h.precipitationProbability>45) return 'El riesgo de precipitación es demasiado alto para montar el equipo.'
  if(h.cloud>65) return 'Las nubes serán el principal obstáculo durante esta franja.'
  if(h.humidity>88 || h.temperature-h.dewPoint<2) return 'Atención a la condensación: prepara las cintas calefactoras.'
  if(planet>deep) return `Nubosidad contenida y estabilidad ${h.jetStream<50?'favorable':'aceptable'} para planetaria.`
  if(moon>70) return 'La Luna limita el cielo profundo de banda ancha; mejor objetos brillantes o banda estrecha.'
  return 'Cielo suficientemente despejado y oscuro para una sesión de cielo profundo.'
}
function Loading(){return <div className="center"><div className="loader"/><h2>Mirando el cielo…</h2><p>Calculando las mejores horas desde tu ubicación</p></div>}
function Empty({error,onRetry}:{error:string,onRetry:()=>void}){return <div className="center"><Moon size={42}/><h2>No pudimos leer el cielo</h2><p>{error||'No hay horas nocturnas disponibles.'}</p><button className="retry" onClick={onRetry}>Reintentar</button></div>}
