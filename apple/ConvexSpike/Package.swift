// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ConvexSpike",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/get-convex/convex-swift", exact: "0.8.1"),
    ],
    targets: [
        .executableTarget(
            name: "ConvexSpike",
            dependencies: [.product(name: "ConvexMobile", package: "convex-swift")]
        ),
    ]
)
