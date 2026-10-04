import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { common } from './ar.ts'
import bidi from './bidi.css?inline'

/** The native locale registry owns selection, persistence and document language. */
export const inject = ['locale']

/**
 * Register Arabic dictionaries and reversible direction/content styling.
 * @param ctx - Browser plugin context with the native locale service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ar', label: 'العربية', fallback: 'en' }), 'd-ai-locale: Arabic language')
  ctx.effect(() => ctx.locale.register('common', 'ar', common), 'd-ai-locale: common dictionary')
  ctx.effect(() => ctx.locale.register('settings.locale', 'ar', { 'language.title': 'اللغة' }), 'd-ai-locale: language settings dictionary')
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('dir')
    const sync = (): void => {
      const active = ctx.locale.getSnapshot().active.toLowerCase().split('-')[0]
      root.dir = active === 'ar' ? 'rtl' : 'ltr'
    }
    const unsubscribe = ctx.locale.subscribe(sync)
    const style = document.createElement('style')
    style.dataset.plugin = '@deepseek-ai/dsh-client-d-ai-locale'
    style.textContent = bidi
    document.head.appendChild(style)
    sync()
    return () => {
      unsubscribe()
      style.remove()
      if (previous === null) root.removeAttribute('dir')
      else root.setAttribute('dir', previous)
    }
  }, 'd-ai-locale: direction and technical content islands')
}
