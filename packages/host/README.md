# Host boundary

`Host` isolates file selection, bounded file reads, downloads and local project
storage from shared product code. It has no MyGo imports. `createBrowserHost()`
uses user-selected `File` capabilities, never arbitrary filesystem paths.
`AbortSignal` rejects cancelled work; reads check cancellation before and after
the browser read. `releaseFile` removes an in-memory capability when no longer
needed. Project storage uses a dedicated versioned localStorage namespace and
reports storage failures instead of silently dropping edits.

`saveFile` initiates a browser download. Resolution means the request was handed
to the browser, not that a user selected a destination or that the file is saved.
The application should use accurate copy for that distinction.

`src/worker-task.ts` runs one message on a caller-constructed Worker and
terminates it on result, failure, cancellation, or timeout. Construct the Worker
at the call site with `new Worker(new URL(...), {type: "module"})` so that Vite
bundles it. Persistent Workers (color, GR Preview, RAW) keep their own lifecycle.

Run tests from the repository root:

```sh
node --experimental-strip-types --test packages/host/test/*.test.ts
```

The optional desktop adapter is `src/desktop.ts`: `createHost()` selects a shell-
supplied `__GR_HOST_RPC__` capability or the browser host. `createDesktopHost(rpc)`
knows no framework. File and project reads/writes cross the JSON-only bridge in
chunks of at most 256 KiB, never as complete RAW/ROM base64 payloads. Native file
IDs reveal no paths. Writes use begin/chunk/commit/cancel; native commit is atomic.
Project saving uses the same bounded transport. A caller can cancel between
chunks; cancelling a pending OS picker takes effect after its dialog returns.
