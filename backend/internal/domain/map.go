package domain

// Map aggregation model — the shapes GET /api/map returns. The map is a single
// public read that gathers every located thing in Oguaa into three overlays:
// points (pins), trails (walking/procession routes) and areas (active directives
// with a geo footprint). Clients toggle layers locally; the server only ever
// returns entities that already carry real coordinates (no geocoding).

// MapPoint is one located pin. Kind is the concrete entity kind; Layer is the
// toggleable grouping the client filters on (several kinds may share a layer).
type MapPoint struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`  // business|event|institution|school|incident|lostfound|landmark|service|transport
	Layer    string  `json:"layer"` // business|events|institutions|safety|lostfound|landmarks|services|transport
	Title    string  `json:"title"`
	Subtitle string  `json:"subtitle,omitempty"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	Slug     string  `json:"slug,omitempty"`
	Href     string  `json:"href,omitempty"`
	Category string  `json:"category,omitempty"`
	Severity string  `json:"severity,omitempty"` // incidents: low|medium|high|critical
	Quarter  string  `json:"quarter,omitempty"`  // resolved from a listing's townId
}

// MapTrailStop is a numbered waypoint on a trail, with a one-line story.
type MapTrailStop struct {
	N     int     `json:"n"`
	Title string  `json:"title"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Story string  `json:"story,omitempty"`
}

// MapTrail is an ordered route drawn as a polyline plus numbered stops — a
// heritage walk or a festival procession.
type MapTrail struct {
	ID          string         `json:"id"`
	Kind        string         `json:"kind"` // heritage|festival
	Title       string         `json:"title"`
	Description string         `json:"description,omitempty"`
	Color       string         `json:"color,omitempty"`
	Stops       []MapTrailStop `json:"stops"`
	Path        [][2]float64   `json:"path"` // [[lat,lng], …]
}

// MapArea is a circular footprint drawn on the map for an active directive that
// carries geo (centre + radius in metres).
type MapArea struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Kind     string  `json:"kind"`     // directive
	Severity string  `json:"severity"` // low|medium|high|critical
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	RadiusM  float64 `json:"radiusM"`
	Until    string  `json:"until,omitempty"` // RFC3339 effectiveUntil, when set
}

// MapPayload is the whole map in one response. Slices are always non-nil so the
// JSON is stable ([] rather than null) for clients.
type MapPayload struct {
	Points []MapPoint `json:"points"`
	Trails []MapTrail `json:"trails"`
	Areas  []MapArea  `json:"areas"`
}
