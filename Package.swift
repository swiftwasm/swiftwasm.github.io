// swift-tools-version:5.2
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "swiftwasm.org",
    products: [
      .executable(name: "App", targets: ["swiftwasm.org"])
    ],
    dependencies: [
      .package(url: "https://github.com/kateinoigakukun/JavaScriptKit", .branch("master")),
    ],
    targets: [
        .target(
            name: "swiftwasm.org",
            dependencies: ["JavaScriptKit"]),
    ]
)
