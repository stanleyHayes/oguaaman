// Package domain holds the core entities of the Oguaa platform — the
// "three-pillar model": Members, Institutions (Organizations), and Listings,
// all riding one submit -> review -> publish engine. Each file pairs an entity
// with its repository interface. Types are storage- and transport-agnostic
// (bson + json tags); the same struct serialises to MongoDB and to the JSON API.
package domain

// SocialLink is a labelled outbound URL (streaming, socials, contact).
type SocialLink struct {
	Label string `json:"label" bson:"label"`
	URL   string `json:"url" bson:"url"`
}

// MediaAsset is an image (or other media) with descriptive metadata, used in
// institution photo galleries and inside gallery section blocks. URL is the
// stored location (Cloudinary secure_url today); Alt/Caption/Credit aid
// accessibility, low-bandwidth fallback, and attribution. Moderation carries a
// review status for a future pre-publish pass (defaults to "approved" — claimed
// managers edit immediately today, matching the existing crest/summary flow).
type MediaAsset struct {
	ID         string `json:"id" bson:"id"`
	URL        string `json:"url" bson:"url"`
	Kind       string `json:"kind,omitempty" bson:"kind,omitempty"`             // photo | logo | cover | document | video
	Alt        string `json:"alt,omitempty" bson:"alt,omitempty"`               // accessibility + load fallback
	Caption    string `json:"caption,omitempty" bson:"caption,omitempty"`       // shown over the image
	Credit     string `json:"credit,omitempty" bson:"credit,omitempty"`         // photographer / source
	Moderation string `json:"moderation,omitempty" bson:"moderation,omitempty"` // approved | pending | rejected
}

// SectionItem is one row inside a list-style profile section: a stat, a team
// member, a timeline entry, an FAQ pair, or a document link. The fields are a
// superset; each section Type uses only the subset it needs (see ProfileSection).
type SectionItem struct {
	ID     string `json:"id,omitempty" bson:"id,omitempty"`
	Label  string `json:"label,omitempty" bson:"label,omitempty"`   // stat label · team role · timeline date · faq question · doc title
	Value  string `json:"value,omitempty" bson:"value,omitempty"`   // stat value · team name · timeline heading · faq answer
	Detail string `json:"detail,omitempty" bson:"detail,omitempty"` // team bio · timeline body · doc note
	Image  string `json:"image,omitempty" bson:"image,omitempty"`   // team photo · timeline image (URL)
	URL    string `json:"url,omitempty" bson:"url,omitempty"`       // doc/file link · external link
}

// Profile section kinds shipped today (see oguaa/Institution-Pages-Spec.md). The
// engine is "one block model, many section kinds": a new kind is a new Type value
// plus a renderer, not new storage.
const (
	SectionRichText = "richtext"     // Title + Body (Markdown, incl. GFM tables)
	SectionGallery  = "gallery"      // Title + Media (an image album, e.g. "Our library")
	SectionStats    = "stats"        // Title + Items (Label/Value pairs)
	SectionTeam     = "team"         // Title + Items (Value=name, Label=role, Detail=bio, Image=photo)
	SectionTimeline = "timeline"     // Title + Items (Label=date, Value=heading, Detail=body)
	SectionFAQ      = "faq"          // Title + Items (Label=question, Value=answer)
	SectionDocs     = "docs"         // Title + Items (Label=title, Detail=note, URL=file)
	SectionQuote    = "quote"        // Body (quotation) + Title (attribution)
	SectionCTA      = "cta"          // Title (heading) + Body (text) + Items (buttons: Label/URL)
	SectionLogos    = "logos"        // Title + Items (Image=logo, Label=name, URL=link) — partners
	SectionDivider  = "divider"      // a decorative Adinkra divider; no content
	SectionGroups   = "groups"       // Title + Groups (sub-entity cards: houses, departments, Asafo, year-groups, lineage)
	SectionHero     = "hero"         // Title (heading) + Body (subtext) + Media[0] (background) + Items (buttons)
	SectionTestim   = "testimonials" // Items (Value=quote, Label=author, Detail=role, Image=photo)
	SectionContact  = "contact"      // Body (address) + Items (Label/Value: hours, phone, email)
	SectionMenu     = "menu"         // Title + Items (Label=item, Value=price, Detail=description) — menus, fees, ticket tiers
	SectionSchedule = "schedule"     // Title + Items (Label=when, Value=time, Detail=note) — prayer times, fixtures, service times, clinic days
	SectionMap      = "map"          // Body (address) + a derived "get directions" link — location
)

// ValidSectionType reports whether t is a shipped section kind.
func ValidSectionType(t string) bool {
	switch t {
	case SectionRichText, SectionGallery, SectionStats, SectionTeam, SectionTimeline, SectionFAQ, SectionDocs,
		SectionQuote, SectionCTA, SectionLogos, SectionDivider, SectionGroups,
		SectionHero, SectionTestim, SectionContact, SectionMenu, SectionSchedule, SectionMap:
		return true
	}
	return false
}

// SubEntity is a child body shown as a card inside a "groups" section — the
// recursive "mini-profile" idea: a school's houses, a university's departments,
// an alumni body's year groups, the seven Asafo companies, a chief's lineage.
// Attrs are key/value facts (housemaster, founded, Supi, era…). Reuses the same
// MediaAsset/SectionItem value types as the rest of the engine.
type SubEntity struct {
	ID       string        `json:"id" bson:"id"`
	Name     string        `json:"name" bson:"name"`
	Subtitle string        `json:"subtitle,omitempty" bson:"subtitle,omitempty"` // role · era · "No. 1"
	CrestURL string        `json:"crestUrl,omitempty" bson:"crestUrl,omitempty"` // optional crest/photo
	Colors   []string      `json:"colors,omitempty" bson:"colors,omitempty"`     // house/company colours (hex)
	Summary  string        `json:"summary,omitempty" bson:"summary,omitempty"`   // short description
	Attrs    []SectionItem `json:"attrs,omitempty" bson:"attrs,omitempty"`       // Label/Value facts
}

// ValidTone reports whether t is an allowed heritage accent (empty = default green).
// Purple (AI) is deliberately absent — it is fenced to admin surfaces.
func ValidTone(t string) bool {
	switch t {
	case "", "green", "clay", "gold", "maroon", "teal":
		return true
	}
	return false
}

// ProfileSection is one author-composed block on an institution's official page.
// Type selects how it renders; sections render in array order. Hidden hides a
// block without deleting it — the zero value is *visible*, so a section authored
// outside the editor (seed/import) shows by default rather than silently vanishing.
// Tone selects a heritage accent (never AI purple).
type ProfileSection struct {
	ID     string        `json:"id" bson:"id"`
	Type   string        `json:"type" bson:"type"`
	Title  string        `json:"title,omitempty" bson:"title,omitempty"`
	Anchor string        `json:"anchor,omitempty" bson:"anchor,omitempty"` // in-page nav target
	Tone   string        `json:"tone,omitempty" bson:"tone,omitempty"`     // green | clay | gold | maroon | teal
	Hidden bool          `json:"hidden,omitempty" bson:"hidden,omitempty"` // zero value = visible
	Body   string        `json:"body,omitempty" bson:"body,omitempty"`     // richtext: Markdown
	Media  []MediaAsset  `json:"media,omitempty" bson:"media,omitempty"`   // gallery
	Items  []SectionItem `json:"items,omitempty" bson:"items,omitempty"`   // stats | team | timeline | faq | docs
	Groups []SubEntity   `json:"groups,omitempty" bson:"groups,omitempty"` // groups (sub-entity cards)
}

// NotFoundError is returned by repositories when a single-entity lookup misses.
type NotFoundError struct{ Entity string }

func (e *NotFoundError) Error() string { return e.Entity + " not found" }

// ForbiddenError is returned when a member lacks the rights for an action (e.g.
// managing an institution they haven't been verified for). Delivery layers map
// it to HTTP 403 / gRPC PermissionDenied.
type ForbiddenError struct{ Reason string }

func (e *ForbiddenError) Error() string {
	if e.Reason == "" {
		return "forbidden"
	}
	return e.Reason
}
