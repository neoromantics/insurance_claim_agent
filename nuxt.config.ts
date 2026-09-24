export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: false,
  app: {
    head: {
      title: 'Insurance Claims Support',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%230A84FF" d="M50 5 L15 20 V50 C15 72 30 88 50 95 C70 88 85 72 85 50 V20 Z"/><path fill="%23FFFFFF" d="M45 65 L30 50 L35 45 L45 55 L65 35 L70 40 Z"/></svg>' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    ollamaApiKey: process.env.OLLAMA_API_KEY || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1',
    ollamaModel: process.env.OLLAMA_MODEL || 'nemotron-3-ultra',
  },
  nitro: {
    experimental: {
      asyncContext: true,
    },
  },
})
