import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/useAuth'
import { AnimatePresence, motion as Motion, useReducedMotion } from 'framer-motion'

import {
  STORAGE_SERVICE_CODE,
  STORAGE_SERVICE_ID,
  STORAGE_SERVICE_NAME,
  enrollPatientInService,
  writePendingServiceSelection,
} from '../lib/patientServiceEnrollment'

const RHU_PILA_HERO_IMAGE_CANDIDATES = [
  `${import.meta.env.BASE_URL}images/rhu-pila-laguna.png`,
  `${import.meta.env.BASE_URL}images/rhu-pila-laguna.jpg`,
  `${import.meta.env.BASE_URL}images/rhu-pila-laguna.jpeg`,
  `${import.meta.env.BASE_URL}images/rhu-pila-laguna.webp`,
]
const FALLBACK_HERO_IMAGES = [
  'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1576765607924-3f7b8410a787?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=2400&q=80',
]

const SERVICES_TEMPLATE = [
  {
    key: 'animal-bite',
    code: 'ABV',
    title: 'Animal Bite',
    description: 'Anti-rabies care and bite management services.',
    icon: 'shield',
  },
  {
    key: 'outpatient',
    code: 'OPD',
    title: 'Outpatient Consultation in the Municipal Health Office',
    description: 'General checkups and primary care consultation.',
    icon: 'stethoscope',
  },
  {
    key: 'permits',
    code: 'ECT',
    title: 'Issuance of exhumation, cremation, transfer permit',
    description: 'Processing of permits and required documentation.',
    icon: 'document',
  },
  {
    key: 'death-cert',
    code: 'RDC',
    title: 'Review of Death Certificate',
    description: 'Review support for proper documentation and compliance.',
    icon: 'clipboard',
  },
  {
    key: 'health-card',
    code: 'IHC',
    title: 'Issuance of Health Card for food and non-food establishment',
    description: 'Health card processing for establishments and workers.',
    icon: 'card',
  },
  {
    key: 'med-cert',
    code: 'IMC',
    title: 'Issuance of medical certificate',
    description: 'Medical certificate issuance based on evaluation.',
    icon: 'badge',
  },
  {
    key: 'sanitary',
    code: 'ISP',
    title: 'Issuance of sanitary permit',
    description: 'Sanitary permit application and requirements handling.',
    icon: 'droplet',
  },
  {
    key: 'tb',
    code: 'TBS',
    title: 'Tuberculosis treatment services',
    description: 'TB services, follow-ups, and treatment monitoring.',
    icon: 'lungs',
  },
  {
    key: 'pre-marriage',
    code: 'PMC',
    title: 'Pre-marriage Counseling',
    description: 'Counseling and guidance sessions for couples.',
    icon: 'heart',
  },
]

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'health-info', label: 'Health Information' },
  { id: 'about', label: 'About Us' },
  { id: 'contact', label: 'Contact' },
]

function Icon({ type }) {
  const common = 'h-6 w-6'
  if (type === 'stethoscope') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M4 3v6a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4V3" />
        <path d="M8 21a6 6 0 0 0 6-6v-1" />
        <path d="M18 8a3 3 0 1 0 0 6" />
        <path d="M18 14v1a4 4 0 0 1-4 4" />
      </svg>
    )
  }
  if (type === 'shield') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    )
  }
  if (type === 'document') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h8" />
      </svg>
    )
  }
  if (type === 'clipboard') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M9 2h6v3H9z" />
        <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
        <path d="M8 11h8" />
        <path d="M8 15h6" />
      </svg>
    )
  }
  if (type === 'card') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M3 7h18" />
        <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        <path d="M7 15h6" />
      </svg>
    )
  }
  if (type === 'badge') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-6z" />
      </svg>
    )
  }
  if (type === 'droplet') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z" />
      </svg>
    )
  }
  if (type === 'lungs') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 11V3" />
        <path d="M12 11c-2-2-3-3-5-3-2 0-3 2-3 4v5c0 2 1 4 3 4 1 0 3-1 5-3" />
        <path d="M12 11c2-2 3-3 5-3 2 0 3 2 3 4v5c0 2-1 4-3 4-1 0-3-1-5-3" />
      </svg>
    )
  }
  if (type === 'heart') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
      <path d="M12 2v20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
      aria-label="RHU homepage"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3v6" />
          <path d="M9 6h6" />
          <path d="M7 21h10" />
          <path d="M12 9c4 0 7 3 7 6 0 3-3 6-7 6s-7-3-7-6c0-3 3-6 7-6z" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="text-base font-extrabold text-emerald-700" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          RHU
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Rural Health Unit</p>
      </div>
    </Link>
  )
}

function HeroSlideshow({ slides }) {
  const safeSlides = Array.isArray(slides) && slides.length > 0 ? slides : []
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (safeSlides.length <= 1) return
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safeSlides.length)
    }, 5000)
    return () => window.clearInterval(id)
  }, [safeSlides.length])

  return (
    <div className="absolute inset-0">
      {safeSlides.map((slide, index) => (
        <div
          key={`${slide?.src ?? ''}-${index}`}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${index === activeIndex ? 'opacity-100' : 'opacity-0'}`}
          style={{
            backgroundImage: `url("${encodeURI((slide?.src ?? '').toString())}")`,
            backgroundPosition: (slide?.position ?? 'center').toString(),
          }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/35 via-emerald-900/10 to-transparent" />
    </div>
  )
}

function useHeroSlides() {
  const [localImageUrl, setLocalImageUrl] = useState('')

  useEffect(() => {
    let mounted = true
    const candidates = RHU_PILA_HERO_IMAGE_CANDIDATES.filter(Boolean)

    const tryLoad = (index) => {
      if (!mounted) return
      const src = candidates[index]
      if (!src) {
        setLocalImageUrl('')
        return
      }
      const img = new Image()
      img.onload = () => {
        if (!mounted) return
        setLocalImageUrl(src)
      }
      img.onerror = () => {
        tryLoad(index + 1)
      }
      img.src = src
    }

    tryLoad(0)
    return () => {
      mounted = false
    }
  }, [])

  return useMemo(() => {
    if (localImageUrl) {
      return [
        { src: localImageUrl, position: 'center' },
        { src: localImageUrl, position: 'center 35%' },
        { src: localImageUrl, position: 'center 65%' },
      ]
    }
    return FALLBACK_HERO_IMAGES.map((src, index) => ({
      src,
      position: index === 0 ? 'center' : index === 1 ? 'center 35%' : 'center 65%',
    }))
  }, [localImageUrl])
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { user, refreshEnrollment } = useAuth()
  const reduceMotion = useReducedMotion()
  const heroSlides = useHeroSlides()
  const headerRef = useRef(null)
  const contentRef = useRef(null)
  const homeServicesRef = useRef(null)
  const [serviceTypes, setServiceTypes] = useState([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem(STORAGE_SERVICE_ID) ?? '')
  const [selectedCode, setSelectedCode] = useState(() => sessionStorage.getItem(STORAGE_SERVICE_CODE) ?? '')
  const [selectedName, setSelectedName] = useState(() => sessionStorage.getItem(STORAGE_SERVICE_NAME) ?? '')
  const [activeTab, setActiveTab] = useState(() => {
    const hash = (window.location.hash ?? '').replace('#', '').trim()
    return NAV_ITEMS.some((item) => item.id === hash) ? hash : 'home'
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const onHashChange = () => {
      const hash = (window.location.hash ?? '').replace('#', '').trim()
      if (hash && NAV_ITEMS.some((item) => item.id === hash)) {
        setActiveTab(hash)
      } else {
        setActiveTab('home')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const nextHash = `#${activeTab}`
    if ((window.location.hash ?? '') !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [activeTab])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      setLoadingServices(true)
      const { data, error: loadError } = await supabase
        .from('service_types')
        .select('id, name, queue_prefix')
        .order('name', { ascending: true })
      if (!isMounted) return
      if (loadError) {
        setServiceTypes([])
        setLoadingServices(false)
        return
      }
      setServiceTypes(Array.isArray(data) ? data : [])
      setLoadingServices(false)
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  const services = useMemo(() => {
    const dbServices = Array.isArray(serviceTypes) ? serviceTypes : []

    const normalize = (value) =>
      (value ?? '')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // Stopwords that must NOT decide a match (shared by many RHU services)
    const STOP = new Set([
      'issuance',
      'issue',
      'of',
      'for',
      'and',
      'the',
      'a',
      'an',
      'to',
      'in',
      'on',
      'with',
      'from',
      'services',
      'service',
      'permit',
      'permits',
      'certificate',
      'food',
      'non',
      'establishment',
      'nonfood',
    ])

    // Distinctive phrases per landing card (checked first, most specific wins)
    const DISTINCTIVE = {
      'animal-bite': [/animal\s*bite/, /anti-?rabies/],
      outpatient: [/outpatient/, /\bopd\b/],
      permits: [/exhumation/, /cremation/, /transfer/],
      'death-cert': [/death\s*cert/],
      'health-card': [/health\s*card/],
      'med-cert': [/medical\s*cert/, /med\s*cert/, /medico-?legal/],
      sanitary: [/sanitary/],
      tb: [/tuberculosis/, /\btb\b/],
      'pre-marriage': [/pre-?\s*marriage/, /premarriage/, /counseling/],
    }

    const scoreMatch = (template, svc) => {
      const svcName = normalize(svc.name)
      const svcPrefix = normalize(svc.queue_prefix)
      const templateTitle = normalize(template.title)
      const templateCode = normalize(template.code)

      // Exact / near-exact wins
      if (svcName && templateTitle && svcName === templateTitle) return 1000
      if (svcPrefix && templateCode && svcPrefix === templateCode) return 900

      const patterns = DISTINCTIVE[template.key] || []
      let score = 0
      for (const re of patterns) {
        if (re.test(svcName)) score += 200
      }
      // Penalize cross-matches (e.g. sanitary must not win on transfer permit)
      if (template.key === 'sanitary' && /exhumation|cremation|transfer/.test(svcName)) return -1
      if (template.key === 'permits' && /sanitary/.test(svcName)) return -1
      if (template.key === 'health-card' && /medical\s*cert|med\s*cert/.test(svcName)) return -1
      if (template.key === 'med-cert' && /health\s*card/.test(svcName)) return -1

      // Light token overlap only on distinctive tokens
      const tokens = templateTitle.split(' ').filter((w) => w.length > 3 && !STOP.has(w))
      for (const tok of tokens) {
        if (svcName.includes(tok)) score += 15
      }
      return score
    }

    const usedIds = new Set()

    return SERVICES_TEMPLATE.map((item) => {
      let best = null
      let bestScore = 0
      for (const svc of dbServices) {
        if (!svc?.id || usedIds.has(svc.id)) continue
        const score = scoreMatch(item, svc)
        if (score > bestScore) {
          bestScore = score
          best = svc
        }
      }
      // Require a minimum confidence so weak "Issuance" overlaps don't bind
      if (!best || bestScore < 100) {
        return { ...item, id: null, code: item.code }
      }
      usedIds.add(best.id)
      return {
        ...item,
        id: best.id,
        code: best.queue_prefix || item.code,
      }
    })
  }, [serviceTypes])

  const handleContentScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const y = el.scrollTop || 0
    setIsScrolled(y > 8)
    setIsCompact(y > 72)
  }, [])

  const openTab = useCallback((tabId) => {
    setMobileNavOpen(false)
    setActiveTab(tabId)
    const el = contentRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [reduceMotion])

  const openHomeServices = useCallback(() => {
    setMobileNavOpen(false)
    setActiveTab('home')
    const scroll = () => {
      const target = homeServicesRef.current
      if (target) {
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      }
    }
    requestAnimationFrame(scroll)
  }, [reduceMotion])

  const handleSelectService = useCallback(async (service) => {
    const nextId = service.id ?? ''
    const nextCode = service.code ?? ''
    const nextName = service.title ?? ''

    console.log('[handleSelectService]', { nextId, nextCode, nextName, user: user?.id ?? null })

    setSelectedId(nextId)
    setSelectedCode(nextCode)
    setSelectedName(nextName)

    if (user && nextId) {
      // User is already logged in — enroll immediately so the dashboard reflects the selection
      const result = await enrollPatientInService(user.id, nextId)
      console.log('[handleSelectService] enrollPatientInService result:', result)
      await refreshEnrollment(user.id)
    } else {
      // Not logged in — persist to sessionStorage so enrollment happens after login
      console.log('[handleSelectService] writing to sessionStorage, nextId:', nextId)
      writePendingServiceSelection({
        serviceId: nextId || null,
        serviceName: nextName || null,
        serviceCode: nextCode || null,
      })
      console.log('[handleSelectService] sessionStorage after write:', {
        id: sessionStorage.getItem('healthtrack_selected_service_type_id'),
        name: sessionStorage.getItem('healthtrack_selected_service_type_name'),
      })
    }
  }, [user, refreshEnrollment])

  const handleLoginClick = useCallback(() => {
    if (user) {
      navigate('/dashboard', { replace: false })
      return
    }
    navigate('/login', { replace: false })
  }, [navigate, user])

  const handleServiceLearnMore = useCallback(
    async (service) => {
      await handleSelectService(service)
      if (user) {
        navigate('/dashboard/queue', { replace: false })
        return
      }
      navigate('/login', { replace: false })
    },
    [handleSelectService, navigate, user],
  )

  return (
    <main className="landing-page min-h-screen bg-white flex flex-col overflow-hidden">
      <Motion.header
        ref={headerRef}
        className={`landing-header sticky top-0 z-30 border-b transition ${
          isScrolled
            ? 'border-slate-200/80 bg-white/75 shadow-sm shadow-slate-900/10 backdrop-blur-xl'
            : 'border-transparent bg-white/45 backdrop-blur'
        }`}
        initial={false}
      >
        <Motion.div
          layout
          className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 ${isCompact ? 'py-2' : 'py-3'}`}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
        >
          <Logo />

          <nav className="relative hidden items-center gap-2 text-sm font-semibold md:flex" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id
              return (
                <Motion.button
                  key={item.id}
                  type="button"
                  onClick={() => openTab(item.id)}
                  className={`relative rounded-full px-3 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 ${
                    isActive ? 'text-teal-700' : 'text-slate-700 hover:text-emerald-700'
                  }`}
                  whileHover={reduceMotion ? undefined : { y: -1 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                >
                  {isActive ? (
                    <Motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-teal-50/80 ring-1 ring-teal-100"
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative">{item.label}</span>
                  {isActive ? (
                    <Motion.span
                      layoutId="nav-underline"
                      className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-teal-600"
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                </Motion.button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Motion.button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-700 shadow-sm transition hover:bg-white md:hidden"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Open navigation"
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </Motion.button>

            <Motion.button
              type="button"
              onClick={() => {
                setMobileNavOpen(false)
                handleLoginClick()
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              whileHover={reduceMotion ? undefined : { y: -1 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
              </svg>
              {user ? 'Dashboard' : 'Login'}
            </Motion.button>
          </div>
        </Motion.div>

        <AnimatePresence>
          {mobileNavOpen ? (
            <Motion.div
              key="mobile-nav"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden overflow-hidden border-t border-slate-200/70 bg-white/80 backdrop-blur-xl"
            >
              <div className="mx-auto w-full max-w-6xl px-4 py-3">
                <div className="grid gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {NAV_ITEMS.map((item) => {
                    const isActive = activeTab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 ${
                          isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        onClick={() => openTab(item.id)}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Motion.div>
          ) : null}
        </AnimatePresence>
      </Motion.header>

      <div ref={contentRef} className="flex-1 overflow-hidden" onScroll={handleContentScroll}>
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <Motion.div
              key="tab-home"
              className="h-full overflow-auto"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <Motion.section
                id="home"
                className="landing-hero relative overflow-hidden"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(34,197,94,0.18),transparent_55%),radial-gradient(circle_at_75%_10%,rgba(20,184,166,0.18),transparent_45%),linear-gradient(180deg,#ffffff_0%,#f8fafc_50%,#ffffff_100%)]" />

                <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:py-14">
                  <div className="max-w-xl">
                    <Motion.p
                      className="chip mb-3"
                      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                      HealthTrack RHU PILA
                    </Motion.p>
                    <Motion.h1
                      className="text-4xl font-extrabold leading-[1.02] text-[#123c47] sm:text-5xl"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                    >
                      Care, closer
                      <br />
                      to home.
                    </Motion.h1>
                    <Motion.p
                      className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base"
                      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                    >
                      Find the right RHU service, join the queue when you arrive, and keep your visit moving from one calm workspace.
                    </Motion.p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <Motion.div
                        className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4"
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="text-sm font-semibold text-cyan-950">Today at RHU Pila</p>
                        <p className="mt-1 text-xs text-cyan-900/75">Monday–Friday · 8:00 AM–5:00 PM</p>
                      </Motion.div>
                      <Motion.div
                        className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4"
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="text-sm font-semibold text-amber-950">A simpler visit</p>
                        <p className="mt-1 text-xs text-amber-900/75">Choose a service before you go.</p>
                      </Motion.div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openHomeServices}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#0e7490] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-900/20 transition hover:bg-[#0b6077] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        Explore Services
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M10 17l5-5-5-5" />
                          <path d="M4 12h11" />
                          <path d="M20 12a8 8 0 1 0-8 8" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => openTab('contact')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        Contact RHU
                      </button>
                    </div>
                  </div>

                  <Motion.div
                    className="relative"
                    initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Motion.div
                      className="relative h-[320px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-xl shadow-slate-900/10 sm:h-[420px]"
                      animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                      transition={reduceMotion ? undefined : { duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <HeroSlideshow slides={heroSlides} />
                      <div className="absolute inset-0" />

                      <Motion.div
                        id="hero-login"
                        className="absolute bottom-5 right-5 w-[min(320px,calc(100%-2.5rem))] rounded-3xl border border-emerald-200 bg-emerald-950/75 p-5 text-white shadow-xl shadow-emerald-950/30 backdrop-blur"
                        initial={reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                          Welcome!
                        </p>
                        <p className="mt-1 text-xs text-emerald-50/90">Please login to access your dashboard and services.</p>
                        {selectedName ? (
                          <p className="mt-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs">
                            Selected: <span className="font-semibold">{selectedName}</span>
                          </p>
                        ) : null}
                        <Motion.button
                          type="button"
                          onClick={() => {
                            if (user) {
                              navigate('/dashboard/queue', { replace: false })
                            } else {
                              navigate('/login', { replace: false })
                            }
                          }}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
                          whileHover={reduceMotion ? undefined : { y: -1 }}
                          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M10 17l5-5-5-5" />
                            <path d="M4 12h11" />
                            <path d="M20 12a8 8 0 1 0-8 8" />
                          </svg>
                          {user ? 'Proceed' : 'Login'}
                        </Motion.button>
                      </Motion.div>
                    </Motion.div>
                  </Motion.div>
                </div>
              </Motion.section>

              <Motion.section
                className="mx-auto w-full max-w-6xl px-4 pb-8"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.45 }}
              >
                <div className="grid gap-3 rounded-[1.5rem] border border-cyan-100 bg-[#123c47] p-4 text-white shadow-[0_18px_40px_-28px_rgba(18,60,71,0.8)] sm:grid-cols-3 sm:p-5">
                  {[
                    ['01', 'Choose a service', 'Start with the care you need.'],
                    ['02', 'Join your queue', 'Get a ticket when you arrive.'],
                    ['03', 'Track your visit', 'See updates and records online.'],
                  ].map(([step, title, description]) => (
                    <div key={step} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                      <span className="font-mono text-xs font-bold text-amber-200">{step}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{title}</p>
                        <p className="mt-1 text-xs text-cyan-100/70">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Motion.section>

              <Motion.section
                ref={homeServicesRef}
                id="home-services"
                className="landing-services mx-auto w-full max-w-6xl px-4 pb-12"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="text-center sm:text-left">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Step 01 / Choose a service</p>
                      <h2 className="text-2xl font-extrabold text-emerald-900 sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        Start with what you need
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">Select a service to prepare your visit at the Rural Health Unit.</p>
                    </div>
                    <div className="flex items-center gap-3 self-center sm:self-auto">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                        {services.length} available
                      </span>
                      <button
                        type="button"
                        onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M12 5v14" />
                          <path d="M6 11l6-6 6 6" />
                        </svg>
                        Top
                      </button>
                    </div>
                  </div>

                  <Motion.div
                    className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.15 }}
                    variants={{
                      hidden: {},
                      show: {
                        transition: reduceMotion ? { duration: 0 } : { staggerChildren: 0.06, delayChildren: 0.06 },
                      },
                    }}
                  >
                    {services.map((service) => {
                      const isSelected =
                        (service.id && selectedId && service.id === selectedId) ||
                        (!service.id &&
                          selectedName &&
                          service.title === selectedName &&
                          (!selectedCode || service.code === selectedCode))
                      return (
                        <Motion.article
                          key={service.key}
                          className={`group relative overflow-hidden rounded-3xl border bg-white p-5 shadow-sm shadow-slate-900/5 ${
                            isSelected ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'
                          }`}
                          variants={{
                            hidden: { opacity: 0, y: 14 },
                            show: { opacity: 1, y: 0 },
                          }}
                          whileHover={reduceMotion ? undefined : { y: -4, scale: 1.01 }}
                          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 20 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-teal-50/70 via-white to-emerald-50/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                          {isSelected ? (
                            <Motion.div
                              className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-emerald-200"
                              animate={reduceMotion ? undefined : { opacity: [0.35, 0.65, 0.35] }}
                              transition={reduceMotion ? undefined : { duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          ) : null}

                          <div className="relative">
                            <div className="flex items-start gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 transition group-hover:bg-white">
                                <Icon type={service.icon} />
                              </div>
                              <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-800">{service.code}</span>
                                  {isSelected ? <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Selected</span> : null}
                                </div>
                                <p className="text-sm font-bold text-slate-900">{service.title}</p>
                                <p className="mt-1 text-xs text-slate-600">{service.description}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                              <Motion.button
                                type="button"
                                className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                                onClick={() => handleServiceLearnMore(service)}
                                whileHover={reduceMotion ? undefined : { x: 2 }}
                                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
                              >
                                Learn More <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                              </Motion.button>

                              <Motion.button
                                type="button"
                                className={`rounded-2xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 ${
                                  isSelected ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                                onClick={() => handleSelectService(service)}
                                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </Motion.button>
                            </div>
                          </div>
                        </Motion.article>
                      )
                    })}
                  </Motion.div>

                  <div className={`mt-5 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${selectedName ? 'border-cyan-200 bg-cyan-50 text-cyan-950' : 'border-dashed border-slate-300 bg-slate-50 text-slate-600'}`}>
                    <span className="font-semibold">{selectedName ? 'Ready for the next step' : 'No service selected yet'}</span>
                    <span className="text-xs sm:text-right">{selectedName ? selectedName : 'Choose one option above to continue.'}</span>
                  </div>

                  <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:flex-row">
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Regular Health Reminder</p>
                      <p className="mt-1 text-sm text-slate-700">Stay healthy, stay safe. Your health is our commitment.</p>
                    </div>
                    <div className="text-center sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Clinic Hours</p>
                      <p className="mt-1 text-sm text-slate-700">Monday - Friday • 8:00 AM - 5:00 PM</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-center">
                    {loadingServices ? <span className="chip mb-0">Loading services...</span> : null}
                  </div>
                </div>
              </Motion.section>
            </Motion.div>
          ) : null}

          {activeTab === 'health-info' ? (
            <Motion.div
              key="tab-health-info"
              className="h-full overflow-auto"
              initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Motion.section id="health-info" className="mx-auto w-full max-w-6xl px-4 py-12">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Health Information
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">Health tips and reminders will appear here in future updates.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTab('home')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Back
                  </button>
                </div>
                <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
                  <p className="text-sm text-slate-700">
                    Coming soon: health advisories, vaccination reminders, seasonal disease prevention tips, and clinic announcements.
                  </p>
                </div>
              </Motion.section>
            </Motion.div>
          ) : null}

          {activeTab === 'about' ? (
            <Motion.div
              key="tab-about"
              className="h-full overflow-auto"
              initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Motion.section id="about" className="mx-auto w-full max-w-6xl px-4 py-12">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      About Us
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      HealthTrack Patient Portal helps you join the RHU queue and view completed medical records from RHU workflow.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTab('home')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Back
                  </button>
                </div>

                <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
                  {!user ? (
                    <p className="text-sm text-slate-600">
                      New here?{' '}
                      <Link to="/register" className="font-semibold text-emerald-700 hover:text-emerald-600">
                        Create a patient account
                      </Link>
                      .
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">You’re signed in. Open your dashboard to view your records and queue tickets.</p>
                  )}
                </div>
              </Motion.section>
            </Motion.div>
          ) : null}

          {activeTab === 'contact' ? (
            <Motion.div
              key="tab-contact"
              className="h-full overflow-auto"
              initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Motion.section id="contact" className="mx-auto w-full max-w-6xl px-4 py-12">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Contact
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">For inquiries, please contact the RHU front desk.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTab('home')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Back
                  </button>
                </div>

                <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
                  <p className="text-sm font-semibold text-slate-900">RHU Pila, Laguna</p>
                  <p className="mt-1 text-sm text-slate-600">Office hours: Monday - Friday • 8:00 AM - 5:00 PM</p>
                </div>

                <div className="mt-8 border-t border-slate-200 pt-6">
                  <p className="text-xs text-slate-500">© {new Date().getFullYear()} HealthTrack. All rights reserved.</p>
                </div>
              </Motion.section>
            </Motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  )
}
