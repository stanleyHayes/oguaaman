package service

import (
	"fmt"
	"math"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"
)

var propertyEditableDetailsKeys = map[string]bool{
	"offerType": true, "propertyType": true, "area": true, "address": true,
	"description": true, "pricePesewas": true, "pricePeriod": true,
	"depositPesewas": true, "bedrooms": true, "bathrooms": true,
	"furnished": true, "amenities": true, "availability": true,
	"availableFrom": true, "contact": true, "bookingUrl": true, "gallery": true,
}

var validPropertyOfferTypes = map[string]bool{"long-term": true, "short-stay": true}
var validPropertyTypes = map[string]bool{
	"room": true, "apartment": true, "house": true, "guesthouse": true, "hostel": true,
}
var validPropertyCadences = map[string]bool{"night": true, "month": true}
var validPropertyAvailability = map[string]bool{"available": true, "reserved": true, "let": true}

// cleanPropertyDetails validates and normalises the deliberately small Rent &
// Stay contract. It also drops unknown keys, so untrusted submissions cannot
// smuggle system-managed details into the polymorphic document.
func cleanPropertyDetails(in map[string]any) (map[string]any, error) {
	out := map[string]any{}
	offer := lowerPropertyString(in, "offerType")
	if !validPropertyOfferTypes[offer] {
		return nil, fmt.Errorf("property offerType must be long-term or short-stay")
	}
	out["offerType"] = offer

	typ := lowerPropertyString(in, "propertyType")
	if !validPropertyTypes[typ] {
		return nil, fmt.Errorf("propertyType must be one of room, apartment, house, guesthouse, hostel")
	}
	out["propertyType"] = typ

	description := strings.TrimSpace(asStringAny(in["description"]))
	if len(description) < 10 || len(description) > 2_000 {
		return nil, fmt.Errorf("property description must be 10–2000 characters")
	}
	out["description"] = description
	address := strings.TrimSpace(asStringAny(in["address"]))
	if len(address) < 2 || len(address) > 240 {
		return nil, fmt.Errorf("property address must be 2–240 characters")
	}
	out["address"] = address
	if area := strings.TrimSpace(asStringAny(in["area"])); area != "" {
		out["area"] = area
	}

	price, ok := propertyInteger(in["pricePesewas"])
	if !ok || price <= 0 {
		return nil, fmt.Errorf("property pricePesewas must be a positive integer")
	}
	out["pricePesewas"] = price
	period := lowerPropertyString(in, "pricePeriod")
	if !validPropertyCadences[period] {
		return nil, fmt.Errorf("property pricePeriod must be month or night")
	}
	out["pricePeriod"] = period

	for _, key := range []string{"depositPesewas", "bedrooms", "bathrooms"} {
		raw, exists := in[key]
		if !exists || raw == nil {
			continue
		}
		if text, ok := raw.(string); ok && strings.TrimSpace(text) == "" {
			continue
		}
		n, ok := propertyInteger(raw)
		if !ok || n < 0 {
			return nil, fmt.Errorf("property %s must be a non-negative integer", key)
		}
		out[key] = n
	}
	if raw, ok := in["furnished"]; ok {
		out["furnished"] = asBoolAny(raw)
	}

	availability := lowerPropertyString(in, "availability")
	if availability == "" {
		availability = "available"
	}
	if !validPropertyAvailability[availability] {
		return nil, fmt.Errorf("property availability must be available, reserved or let")
	}
	out["availability"] = availability
	if availableFrom := strings.TrimSpace(asStringAny(in["availableFrom"])); availableFrom != "" {
		if _, err := time.Parse(time.DateOnly, availableFrom); err != nil {
			return nil, fmt.Errorf("property availableFrom must be YYYY-MM-DD")
		}
		out["availableFrom"] = availableFrom
	}

	if raw, exists := in["amenities"]; exists {
		amenities, ok := propertyStringList(raw)
		if !ok {
			return nil, fmt.Errorf("property amenities must be a list of text values")
		}
		out["amenities"] = amenities
	}
	if raw, ok := in["contact"]; ok {
		contact, valid := cleanPropertyLinks(raw, true)
		if !valid {
			return nil, fmt.Errorf("property contact must be a list of labelled safe links")
		}
		out["contact"] = contact
	}
	if raw, ok := in["gallery"]; ok {
		gallery, valid := cleanPropertyLinks(raw, false)
		if !valid {
			return nil, fmt.Errorf("property gallery must be a list of safe image links")
		}
		out["gallery"] = gallery
	}
	if bookingURL := strings.TrimSpace(asStringAny(in["bookingUrl"])); bookingURL != "" {
		parsed, err := url.ParseRequestURI(bookingURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return nil, fmt.Errorf("property bookingUrl must be a valid http(s) URL")
		}
		out["bookingUrl"] = safeURL(bookingURL)
	}
	return out, nil
}

func lowerPropertyString(in map[string]any, key string) string {
	return strings.ToLower(strings.TrimSpace(asStringAny(in[key])))
}

func propertyInteger(v any) (int64, bool) {
	switch x := v.(type) {
	case int:
		return int64(x), true
	case int32:
		return int64(x), true
	case int64:
		return x, true
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) || math.Trunc(x) != x || x > math.MaxInt64 || x < math.MinInt64 {
			return 0, false
		}
		return int64(x), true
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func propertyStringList(v any) ([]string, bool) {
	raw := asStringSlice(v)
	if raw == nil {
		return nil, false
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(raw))
	for _, value := range raw {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
		if len(out) == 30 {
			break
		}
	}
	return out, true
}

// cleanPropertyLinks canonicalises the two link arrays exposed by Rent & Stay.
// Generic listing link cleaning is intentionally best-effort for legacy data,
// but property pages call array methods directly and must never receive a
// scalar/null entry that can crash discovery or enquiry. Reflection keeps this
// compatible with JSON []any payloads, typed seed []SocialLink values, and the
// Mongo driver's named slice/document representations without importing bson.
func cleanPropertyLinks(v any, contact bool) ([]map[string]any, bool) {
	rv := indirectPropertyValue(reflect.ValueOf(v))
	if !rv.IsValid() || rv.Kind() != reflect.Slice {
		return nil, false
	}
	out := make([]map[string]any, 0, rv.Len())
	for i := 0; i < rv.Len() && len(out) < 30; i++ {
		fields, ok := propertyLinkFields(rv.Index(i))
		if !ok {
			return nil, false
		}
		rawURL := strings.TrimSpace(fields["url"])
		cleanURL := safeURL(rawURL)
		if cleanURL == "" || (contact && !isPropertyContactURL(cleanURL)) {
			return nil, false
		}
		link := map[string]any{"url": cleanURL}
		if label := strings.TrimSpace(fields["label"]); label != "" {
			link["label"] = label
		}
		if caption := strings.TrimSpace(fields["caption"]); caption != "" {
			link["caption"] = caption
		}
		out = append(out, link)
	}
	return out, true
}

func isPropertyContactURL(value string) bool {
	lower := strings.ToLower(value)
	return strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") ||
		strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:")
}

func indirectPropertyValue(rv reflect.Value) reflect.Value {
	for rv.IsValid() && (rv.Kind() == reflect.Interface || rv.Kind() == reflect.Pointer) {
		if rv.IsNil() {
			return reflect.Value{}
		}
		rv = rv.Elem()
	}
	return rv
}

func propertyLinkFields(value reflect.Value) (map[string]string, bool) {
	rv := indirectPropertyValue(value)
	if !rv.IsValid() {
		return nil, false
	}
	fields := map[string]string{}
	switch rv.Kind() {
	case reflect.Map:
		iter := rv.MapRange()
		for iter.Next() {
			key := indirectPropertyValue(iter.Key())
			val := indirectPropertyValue(iter.Value())
			if key.IsValid() && key.Kind() == reflect.String && val.IsValid() && val.Kind() == reflect.String {
				fields[strings.ToLower(key.String())] = val.String()
			}
		}
	case reflect.Struct:
		for i := 0; i < rv.NumField(); i++ {
			field := indirectPropertyValue(rv.Field(i))
			if field.IsValid() && field.Kind() == reflect.String {
				fields[strings.ToLower(rv.Type().Field(i).Name)] = field.String()
			}
		}
	case reflect.Slice:
		// bson.D is a slice of {Key string, Value any} elements.
		for i := 0; i < rv.Len(); i++ {
			entry := indirectPropertyValue(rv.Index(i))
			if !entry.IsValid() || entry.Kind() != reflect.Struct {
				return nil, false
			}
			key := indirectPropertyValue(entry.FieldByName("Key"))
			val := indirectPropertyValue(entry.FieldByName("Value"))
			if key.IsValid() && key.Kind() == reflect.String && val.IsValid() && val.Kind() == reflect.String {
				fields[strings.ToLower(key.String())] = val.String()
			}
		}
	default:
		return nil, false
	}
	_, hasURL := fields["url"]
	return fields, hasURL
}

func appendUniqueTag(tags []string, tag string) []string {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return tags
	}
	for _, existing := range tags {
		if existing == tag {
			return tags
		}
	}
	return append(tags, tag)
}
