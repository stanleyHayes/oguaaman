package service

import (
	"fmt"
	"math"
	"strings"
)

var validEventFormats = map[string]bool{"festival": true, "concert": true, "workshop": true, "conference": true, "community": true, "sports": true, "ceremony": true, "exhibition": true, "nightlife": true, "fundraiser": true, "other": true}

// validateEventRange keeps date ranges coherent across ordinary submissions,
// owner edits, and institution-posted events. ISO date and datetime strings
// sort chronologically by their YYYY-MM-DD prefix.
func validateEventRange(details map[string]any) error {
	start, _ := details["startsAt"].(string)
	end, _ := details["endsAt"].(string)
	start = strings.TrimSpace(start)
	end = strings.TrimSpace(end)
	if end == "" {
		return nil
	}
	if start == "" {
		return fmt.Errorf("an event start date is required when an end date is provided")
	}
	if len(start) < 10 || len(end) < 10 {
		return fmt.Errorf("event dates must use ISO date format")
	}
	if end[:10] < start[:10] {
		return fmt.Errorf("event end date cannot be before its start date")
	}
	return nil
}

func cleanEventDetails(details map[string]any) (map[string]any, error) {
	format := strings.TrimSpace(asStringAny(details["eventFormat"]))
	if format != "" && !validEventFormats[format] {
		return nil, fmt.Errorf("invalid event format")
	}
	admission := strings.TrimSpace(asStringAny(details["admission"]))
	if admission == "" {
		if _, hasTiers := details["tiers"]; hasTiers {
			admission = "paid"
		} else {
			admission = "free"
		}
	}
	if admission != "free" && admission != "paid" {
		return nil, fmt.Errorf("event admission must be free or paid")
	}
	details["admission"] = admission
	if admission == "free" {
		delete(details, "tiers")
		return details, nil
	}
	tiers, err := cleanEventTiers(details["tiers"])
	if err != nil {
		return nil, err
	}
	if len(tiers) == 0 {
		return nil, fmt.Errorf("paid events need at least one ticket type")
	}
	details["tiers"] = tiers
	return details, nil
}

func cleanEventTiers(raw any) ([]map[string]any, error) {
	rows, ok := raw.([]any)
	if !ok {
		if typed, yes := raw.([]map[string]any); yes {
			rows = make([]any, len(typed))
			for i := range typed {
				rows[i] = typed[i]
			}
		} else {
			return nil, fmt.Errorf("ticket types must be a list")
		}
	}
	if len(rows) > 8 {
		return nil, fmt.Errorf("events may have at most 8 ticket types")
	}
	out := make([]map[string]any, 0, len(rows))
	seen := map[string]bool{}
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("invalid ticket type")
		}
		name := strings.TrimSpace(asStringAny(m["name"]))
		if name == "" || len(name) > 80 {
			return nil, fmt.Errorf("each ticket type needs a name of at most 80 characters")
		}
		key := strings.ToLower(name)
		if seen[key] {
			return nil, fmt.Errorf("ticket type names must be unique")
		}
		seen[key] = true
		price := eventInt64(m["pricePesewas"])
		capacity := int(eventInt64(m["capacity"]))
		if price <= 0 || price > 100_000_000 {
			return nil, fmt.Errorf("ticket prices must be between GH₵0.01 and GH₵1,000,000")
		}
		if capacity < 0 || capacity > 1_000_000 {
			return nil, fmt.Errorf("ticket capacity must be between 0 and 1,000,000")
		}
		out = append(out, map[string]any{"name": name, "pricePesewas": price, "capacity": capacity})
	}
	return out, nil
}

func eventInt64(v any) int64 {
	switch n := v.(type) {
	case int:
		return int64(n)
	case int32:
		return int64(n)
	case int64:
		return n
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0
		}
		return int64(n)
	default:
		return 0
	}
}
