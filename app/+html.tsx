import { ScrollViewStyleReset } from 'expo-router/html'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1.00001,viewport-fit=cover" />
        <ScrollViewStyleReset />
        
        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#000000" />
        <meta name="description" content="Active Next - Your personal activity companion" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Active" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        
        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
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
  height: 100%;
  margin: 0;
  padding: 0;
}

/* Center app and constrain to mobile width for PWA */
#root {
  max-width: 550px;
  margin: 0 auto;
  position: relative;
  overflow: hidden;
  background-color: #fff;
}

body {
  background-color: #fff;
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #1a1a1a;
  }
  #root {
    background-color: #000;
  }
}

/* Add shadow on larger screens for visual separation */
@media (min-width: 431px) {
  #root {
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
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
