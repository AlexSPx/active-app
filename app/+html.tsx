import { ScrollViewStyleReset } from 'expo-router/html'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <ScrollViewStyleReset />

        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#FAF7FC" />
        <meta name="description" content="Active Next - Your personal activity companion" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Active" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        {/* Keep the shell aligned with the system theme until the saved preference hydrates. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerScript }} />
      </body>
    </html>
  )
}

const responsiveBackground = `
html, body, #root {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

html, body {
  min-height: 100svh;
  background-color: #faf7fc;
  color: #2d2235;
}

#root {
  width: 100%;
  max-width: 1200px;
  min-height: 100svh;
  margin: 0 auto;
  position: relative;
  background-color: var(--color-background, #faf7fc);
}

body {
  min-width: 320px;
}

@media (prefers-color-scheme: dark) {
  html, body {
    background-color: #2d2235;
    color: #faf5fc;
  }
  #root {
    background-color: var(--color-background, #2d2235);
  }
}

@media (min-width: 768px) {
  body {
    background-color: #f0e9f5;
  }
}

@media (min-width: 768px) and (prefers-color-scheme: dark) {
  body {
    background-color: #382b42;
  }
}`

const serviceWorkerScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(function(err) {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}
`
