// Why: Excalidraw loads its fonts from a CDN unless told where the app's bundled copies are.
Reflect.set(window, 'EXCALIDRAW_ASSET_PATH', new URL('excalidraw-assets/', document.baseURI).href)
