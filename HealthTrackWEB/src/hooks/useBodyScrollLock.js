import { useEffect } from 'react'

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined

    const body = document.body
    const html = document.documentElement
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const previousHtmlOverflow = html.style.overflow
    const scrollContainers = Array.from(document.querySelectorAll('.app-main, .app-sidebar-inner'))
    const initialScrollTops = scrollContainers.map((container) => container.scrollTop)
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'

    const preventBackgroundScroll = (event) => {
      if (!event.target.closest?.('[role="dialog"]')) event.preventDefault()
    }
    const restoreContainerScroll = () => {
      scrollContainers.forEach((container, index) => {
        if (container.scrollTop !== initialScrollTops[index]) container.scrollTop = initialScrollTops[index]
      })
    }

    scrollContainers.forEach((container) => {
      container.addEventListener('wheel', preventBackgroundScroll, { passive: false })
      container.addEventListener('touchmove', preventBackgroundScroll, { passive: false })
      container.addEventListener('scroll', restoreContainerScroll)
    })
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
      html.style.overflow = previousHtmlOverflow
      scrollContainers.forEach((container) => {
        const index = scrollContainers.indexOf(container)
        container.scrollTop = initialScrollTops[index]
        container.removeEventListener('wheel', preventBackgroundScroll)
        container.removeEventListener('touchmove', preventBackgroundScroll)
        container.removeEventListener('scroll', restoreContainerScroll)
      })
    }
  }, [locked])
}
