---
date: 2020-09-30 14:34
description: An update on what happened in the SwiftWasm ecosystem during September 2020.
tags: update, javascriptkit
---
# September 2020 Update

## Libraries

[JavaScriptKit 0.7](https://github.com/swiftwasm/JavaScriptKit/releases/tag/0.7.0) has been
released. It adds multiple new types bridged from JavaScript, 
namely `JSError`, `JSDate`, `JSTimer` (which corresponds to `setTimeout`/`setInterval` calls and 
manages closure lifetime for you), `JSString` and `JSPromise`. We now also have [documentation 
published automatically](https://swiftwasm.github.io/JavaScriptKit/) for the `main` branch.

New features of JavaScriptKit allowed us to start working on closer integration with
[OpenCombine](https://github.com/OpenCombine/OpenCombine). The current progress is available in the
new [OpenCombineJS](https://github.com/swiftwasm/OpenCombineJS) repository, and we plan to tag a
release for it soon. At the moment it has a `JSScheduler` class wrapping `JSTimer` that implements
[the `Scheduler` protocol](https://developer.apple.com/documentation/combine/scheduler), enabling
you to use `debounce` and other time-based operators. Additionally, OpenCombineJS now provides a
helper `publisher` property on `JSPromise`, which allows you to integrate any promise-based API with
an OpenCombine pipeline.

We also saw a lot of great progress with [DOMKit](https://github.com/swiftwasm/DOMKit) in September,
which was unblocked by the recent additions to JavaScriptKit. With DOMKit we're going to get 
type-safe access to the most common browser DOM APIs. It will be expanded in the future to
support even more features that currently are only available via JavaScriptKit through force
unwrapping and dynamic casting.

That is, compare the current API you get with JavaScriptKit:

```swift
import JavaScriptKit

let document = JSObject.global.document.object!

let divElement = document.createElement!("div").object!
divElement.innerText = "Hello, world"
let body = document.body.object!
_ = body.appendChild!(divElement)
```

to an equivalent snippet that could look like this with DOMKit:

```swift
import DOMKit

let document = global.document

let divElement = document.createElement("div")
divElement.innerText = "Hello, world"
document.body.appendChild(divElement)
```

Lastly on the libraries front, [Tokamak 0.4](https://github.com/TokamakUI/Tokamak/releases) is now
available, enabling compatibility with the new version of JavaScriptKit, and utilizing the 
aforementioned `JSScheduler` implementation.

## Developer tools

Following the new 0.7 release of JavaScriptKit, [`carton`
0.6](https://github.com/swiftwasm/carton/releases/tag/0.6.0) has been tagged , shipping with the
appropriate JavaScriptKit runtime compatible with the new release. It also includes support for the
new `carton bundle` command that produces a directory with optimized build output ready for
deployment on a CDN or any other server. Notably, both `carton bundle` and `carton dev` support
[SwiftPM package
resources](https://github.com/apple/swift-evolution/blob/master/proposals/0271-package-manager-resources.md),
allowing you to include additional static content to your SwiftWasm apps. These could be styles,
scripts, images, fonts, or whatever other data you'd like to ship with your app.

This version of `carton` also ships with the latest version of
[wasmer.js](https://github.com/wasmerio/wasmer-js/), which is one of our dependencies. This update
brings compatibility of SwiftWasm apps with Safari 14 that was released recently.

## Toolchain/SDK work

The upstream Swift toolchain has switched to use the upcoming LLVM 11 API in the `main` branch.
This caused a substantial amount of conflicts in our forked repositories, and we've spent most
of our time in September on resolving the conflicts and making sure everything builds properly 
again. You could've noticed that the previously steady stream of nighly development snapshots has
stalled for most of September, but it resumed starting with `wasm-DEVELOPMENT-SNAPSHOT-2020-09-20-a`.

As for the 5.3 branch, with the upstream Swift 5.3.0 release now generally available, we're 
currently preparing a stable SwiftWasm 5.3.0 release. It is based off upstream 5.3.0
with our patches applied to the toolchain and SDK. [A short 
checklist](https://github.com/swiftwasm/swift/issues/1759) was created that allows us to track our
progress towards tagging the release. 

One of the issues we wanted to resolve before tagging SwiftWasm 5.3.0 is the inconsistency between
WASI and Glibc APIs. While there's a subset of these APIs that looks and works the same, there are a
lot of differences that our users should be aware of. Because of this, in subsequent snapshots our
users need to use `import WASILibc` instead of `import Glibc` if they need to access to libc on the
WASI platform. This has already landed in the `swiftwasm-release/5.3` branch with
[swiftwasm/swift#1773](https://github.com/swiftwasm/swift/pull/1773) and is available 
in `wasm-5.3-SNAPSHOT-2020-09-23-a` or later. You can track ongoing work to implement this in the 
main `swiftwasm` branch in [swiftwasm/swift#1832](https://github.com/swiftwasm/swift/pull/1832).

## Upstream PRs

The divergence between the SwiftWasm toolchain and SDKs is still significant and causes regular
conflicts that we have to resolve manually. We're working on making our changes available upstream,
but this takes a lot of time, as especially toolchain PRs need high level of polish to be accepted.
Here's a list of PRs that had some progress in September:

### Foundation

* Add locking primitives for `TARGET_OS_WASI` in `CFLocking.h`
  [apple/swift-corelibs-foundation#2867](https://github.com/apple/swift-corelibs-foundation/pull/2867).
  **Status: merged.**
* Add support for WASI in `CFInternal.h`
  [apple/swift-corelibs-foundation#2872](https://github.com/apple/swift-corelibs-foundation/pull/2872).
  **Status: merged.**
* Add WASI support in `CoreFoundation_Prefix.h`
  [apple/swift-corelibs-foundation#2873](https://github.com/apple/swift-corelibs-foundation/pull/2873).
  **Status: merged.**
* Add support for WASI in `CFDate.c`
  [apple/swift-corelibs-foundation#2880](https://github.com/apple/swift-corelibs-foundation/pull/2880).
  **Status: in review.**

### SwiftPM

* Propagate PATH to UserToolchain to fix sysroot search
  [apple/swift-package-manager#2936](https://github.com/apple/swift-package-manager/pull/2936).
  **Status: in review.**