import Foundation
import Publish
import Plot

// This type acts as the configuration for your website.
struct Updates: Website {
    enum SectionID: String, WebsiteSectionID {
        // Add the sections that you want your website to contain here:
        case posts
    }

    struct ItemMetadata: WebsiteItemMetadata {
        // Add any site-specific metadata that you want to use here.
    }

    // Update these properties to configure your website:
    var url = URL(string: "https://swiftwasm.org/whats-new")!
    var name = "What's new in SwiftWasm"
    var description = ""
    var language: Language { .english }
    var imagePath: Path? { nil }
}

// This will generate your website using the built-in Foundation theme:
try Updates().publish(withTheme: .foundation)
