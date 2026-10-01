package mongo

import (
	"reflect"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// bsonFieldNames lists the document keys a struct is stored under.
func bsonFieldNames(v any) []string {
	rt := reflect.TypeOf(v)
	out := []string{}
	for i := 0; i < rt.NumField(); i++ {
		name := strings.Split(rt.Field(i).Tag.Get("bson"), ",")[0]
		if name != "" && name != "-" {
			out = append(out, name)
		}
	}
	return out
}

// Every stored Plan field except the immutable _id/createdAt must be written by
// Update — take-rate and storefront caps were once silently dropped (F138).
func TestPlanFields_coverEveryConfigurableField(t *testing.T) {
	set := planFields(domain.Plan{})
	stored := map[string]bool{}
	for _, name := range bsonFieldNames(domain.Plan{}) {
		stored[name] = true
		if name == "_id" || name == "createdAt" {
			if _, ok := set[name]; ok {
				t.Errorf("Update must not rewrite the immutable %q", name)
			}
			continue
		}
		if _, ok := set[name]; !ok {
			t.Errorf("Update would silently drop plan field %q", name)
		}
	}
	for key := range set {
		if !stored[key] {
			t.Errorf("Update writes %q, which is not a stored Plan field", key)
		}
	}
}

// Edited values — including edits down to zero — are what Update writes.
func TestPlanFields_writeEditedValuesIncludingZero(t *testing.T) {
	set := planFields(domain.Plan{TakeRatePercent: 10, MaxProducts: 20, MaxServices: 0})
	if set["takeRatePercent"] != 10 || set["maxProducts"] != 20 {
		t.Errorf("take-rate/products = %v/%v, want 10/20", set["takeRatePercent"], set["maxProducts"])
	}
	if v, ok := set["maxServices"]; !ok || v != 0 {
		t.Errorf("maxServices = %v (present %v), want an explicit 0", v, ok)
	}
}
