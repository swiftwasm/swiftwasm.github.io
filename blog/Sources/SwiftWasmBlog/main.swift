import Foundation
import Plot
import Publish
import SplashPublishPlugin

// This type acts as the configuration for your website.
struct Blog: Website {
  enum SectionID: String, WebsiteSectionID {
    // Add the sections that you want your website to contain here:
    case posts
  }

  struct ItemMetadata: WebsiteItemMetadata {
    // Add any site-specific metadata that you want to use here.
  }

  // Update these properties to configure your website:
  var url = URL(string: "https://swiftwasm.org/blog")!
  var name = "SwiftWasm Blog"
  var description = ""
  var language: Language { .english }
  var imagePath: Path? { nil }
}

// This will generate your website using the built-in Foundation theme:
try Blog().publish(using: [
  .installPlugin(.splash(withClassPrefix: "splash-")),
  .addMarkdownFiles(),
  .generateHTML(withTheme: .swiftwasm),
  .generateRSSFeed(including: [.posts]),
  .generateSiteMap(),
])
