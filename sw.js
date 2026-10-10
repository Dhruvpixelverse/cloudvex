"use strict";

/*
 * CloudVex — Master Elite Service Worker
 * Purpose: versioned app-shell caching and safe offline fallback.
 * Does NOT emulate or stream games.
 */

const SW_VERSION = "cloudvex-v1";
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith("cloudvex-") &&
            key !== STATIC_CACHE &&
            key !== RUNTIME_CACHE
          )
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Navigation: try the network first so updates aren't hidden
  // behind an old cached homepage.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(RUNTIME_CACHE)
              .then((cache) => cache.put("./index.html", copy))
              .catch(() => {});

          }

          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request) ||
            await caches.match("./index.html") ||
            new Response(
              "CloudVex is offline. Reconnect to the internet and try again.",
              {
                status: 503,
                headers: {
                  "Content-Type": "text/plain; charset=utf-8"
                }
              }
            )
          );
        })
    );

    return;
  }

  // Cache-first for the small, same-origin app-shell files.
  const pathname = url.pathname;
  const isAppAsset =
    pathname.endsWith("/manifest.json") ||
    pathname.endsWith("/icon.svg");

  if (isAppAsset) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;

        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      })
    );
  }
});
