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
        { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏥</text></svg>' },
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
