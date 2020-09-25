// swift-tools-version:5.3

import PackageDescription

let package = Package(
    name: "WhatsNewInSwiftWasm",
    products: [
        .executable(
            name: "generate",
            targets: ["WhatsNew"]
        )
    ],
    dependencies: [
        .package(name: "Publish", url: "https://github.com/johnsundell/publish.git", from: "0.7.0")
    ],
    targets: [
        .target(
            name: "WhatsNew",
            dependencies: ["Publish"]
        )
    ]
)